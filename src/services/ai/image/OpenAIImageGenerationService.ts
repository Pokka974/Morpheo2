import { supabase } from '../../../supabase/client';
import { sqlite } from '../../../db/client';
import type {
  ImageGenerationService,
  ImageGenerationRequest,
  MediaResult,
} from './ImageGenerationService';
import {
  ContentSafetyError,
  RegenerationLimitError,
  ImageLimitError,
  ImageGenerationProviderError,
} from './ImageGenerationService';
import type { StorageService } from '../../storage/StorageService';

interface LocalMediaRow {
  id: string;
  dream_id: string;
  media_type: string;
  generation_status: string;
  local_cache_path: string | null;
  regeneration_count: number;
  max_regenerations: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class OpenAIImageGenerationService implements ImageGenerationService {
  constructor(private readonly storage: StorageService) {}

  async generateImage(request: ImageGenerationRequest): Promise<MediaResult> {
    const response = (await supabase.functions.invoke<unknown>('generate-image', {
      body: request,
    })) as { data: unknown; error: unknown };
    const { data, error } = response;

    if (error) {
      const status = (error as { status?: number }).status;
      const body = data as { error?: string } | null;
      if (status === 400 && body?.error === 'safety_blocked') throw new ContentSafetyError('input');
      if (status === 409 && body?.error === 'regen_limit_reached') {
        throw new RegenerationLimitError((body as { max?: number })['max'] ?? 3);
      }
      if (status === 429) {
        throw new ImageLimitError(
          new Date(
            (body as { resetDate?: string })?.['resetDate'] ?? Date.now() + 30 * 24 * 60 * 60 * 1000
          )
        );
      }
      if (status === 503 || status === 500) throw new ImageGenerationProviderError(true);
      throw new ImageGenerationProviderError(false);
    }

    const result = data as MediaResult;
    if (result.signedUrl && result.generationStatus === 'complete') {
      let localPath: string | null = null;
      try {
        localPath = await this.storage.cacheMedia(result.id, result.signedUrl);
      } catch {
        localPath = null;
      }
      const withLocalPath = { ...result, localCachePath: localPath };
      await this.persistLocally(withLocalPath);
      return withLocalPath;
    }
    return result;
  }

  /**
   * The Supabase `media` row has no durable, directly-renderable URI — signed
   * URLs expire in an hour and are never stored, and `storage_key` is a bucket
   * path, not a URL. `local_cache_path` (the on-device file this generation just
   * downloaded) is the only thing that lets a dream reopened later — or another
   * screen reading the local dreams list — actually show the image, so every
   * successful generation mirrors its result into the local `media` table.
   * A failure here is non-fatal: generation itself already succeeded server-side.
   */
  private async persistLocally(media: MediaResult): Promise<void> {
    try {
      await sqlite.runAsync(
        `INSERT INTO media
          (id, dream_id, media_type, generation_status, local_cache_path, regeneration_count, max_regenerations, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           generation_status = excluded.generation_status,
           local_cache_path = excluded.local_cache_path,
           regeneration_count = excluded.regeneration_count,
           max_regenerations = excluded.max_regenerations,
           error_message = excluded.error_message,
           updated_at = excluded.updated_at`,
        [
          media.id,
          media.dreamId,
          media.mediaType,
          media.generationStatus,
          media.localCachePath,
          media.regenerationCount,
          media.maxRegenerations,
          media.errorMessage,
          media.createdAt,
          media.updatedAt,
        ]
      );
    } catch (err) {
      console.error('Failed to persist generated media locally:', err);
    }
  }

  async getImage(dreamId: string): Promise<MediaResult | null> {
    // Local SQLite is the primary store (offline-first): a generation this device
    // ran is written there immediately by persistLocally(), well before any pull
    // sync would carry it back down from Supabase.
    const localRow = await sqlite.getFirstAsync<LocalMediaRow>(
      `SELECT id, dream_id, media_type, generation_status, local_cache_path, regeneration_count, max_regenerations, error_message, created_at, updated_at
       FROM media WHERE dream_id = ? AND media_type = 'image' ORDER BY created_at DESC LIMIT 1`,
      dreamId
    );
    if (localRow) {
      return {
        id: localRow.id,
        dreamId: localRow.dream_id,
        mediaType: localRow.media_type as 'image' | 'video',
        generationStatus: localRow.generation_status as MediaResult['generationStatus'],
        signedUrl: null,
        localCachePath: localRow.local_cache_path,
        regenerationCount: localRow.regeneration_count,
        maxRegenerations: localRow.max_regenerations,
        errorMessage: localRow.error_message,
        createdAt: localRow.created_at,
        updatedAt: localRow.updated_at,
      };
    }

    // Falls back to Supabase directly for a dream whose image was generated on
    // another device and has not been pulled down to this one yet.
    const response = (await supabase
      .from('media')
      .select('*')
      .eq('dream_id', dreamId)
      .eq('media_type', 'image')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: unknown; error: unknown };
    const { data, error } = response;

    if (error || !data) return null;
    return this.mapRow(data as Record<string, unknown>);
  }

  async getSignedUrl(mediaId: string): Promise<string> {
    const response = (await supabase.functions.invoke<unknown>('media-url', {
      body: { mediaId },
    })) as { data: unknown; error: unknown };
    const { data, error } = response;
    if (error || !data) throw new Error('Failed to get signed URL');
    return (data as { signedUrl: string }).signedUrl;
  }

  private mapRow(row: Record<string, unknown>): MediaResult {
    return {
      id: row['id'] as string,
      dreamId: row['dream_id'] as string,
      mediaType: row['media_type'] as 'image' | 'video',
      generationStatus: row['generation_status'] as MediaResult['generationStatus'],
      signedUrl: null,
      localCachePath: null,
      regenerationCount: row['regeneration_count'] as number,
      maxRegenerations: row['max_regenerations'] as number,
      errorMessage: row['error_message'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
}
