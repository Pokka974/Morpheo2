import { supabase } from '../../../supabase/client';
import type {
  ImageGenerationService,
  ImageGenerationRequest,
  MediaResult,
} from './ImageGenerationService';
import {
  ContentSafetyError,
  RegenerationLimitError,
  ImageLimitError,
} from './ImageGenerationService';
import type { StorageService } from '../../storage/StorageService';

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
      throw error;
    }

    const result = data as MediaResult;
    if (result.signedUrl && result.generationStatus === 'complete') {
      try {
        const localPath = await this.storage.cacheMedia(result.id, result.signedUrl);
        return { ...result, localCachePath: localPath };
      } catch {
        return result;
      }
    }
    return result;
  }

  async getImage(dreamId: string): Promise<MediaResult | null> {
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
