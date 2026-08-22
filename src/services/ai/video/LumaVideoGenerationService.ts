import { supabase } from '../../../supabase/client';
import type {
  VideoGenerationService,
  VideoGenerationRequest,
  VideoJob,
} from './VideoGenerationService';
import { PremiumRequiredError } from './VideoGenerationService';
import type { MediaResult } from '../image/ImageGenerationService';

export class LumaVideoGenerationService implements VideoGenerationService {
  async submitVideoJob(request: VideoGenerationRequest): Promise<VideoJob> {
    const response = (await supabase.functions.invoke<unknown>('generate-video', {
      body: request,
    })) as { data: unknown; error: unknown };
    const { data, error } = response;

    if (error) {
      const status = (error as { status?: number }).status;
      const body = data as { error?: string } | null;
      if (status === 403 && body?.error === 'premium_required') throw new PremiumRequiredError();
      throw error;
    }

    return data as VideoJob;
  }

  async getJobStatus(jobId: string): Promise<VideoJob> {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('id, status, media_id, estimated_duration_seconds')
      .eq('id', jobId)
      .single();

    if (error || !data) throw new Error(`Job ${jobId} not found`);
    const row = data as Record<string, unknown>;

    return {
      jobId: row['id'] as string,
      mediaId: row['media_id'] as string,
      status: row['status'] as VideoJob['status'],
      estimatedDurationSeconds: row['estimated_duration_seconds'] as number,
    };
  }

  async getVideo(dreamId: string): Promise<MediaResult | null> {
    const response = (await supabase
      .from('media')
      .select('*')
      .eq('dream_id', dreamId)
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()) as { data: unknown; error: unknown };
    const { data, error } = response;

    if (error || !data) return null;
    const row = data as Record<string, unknown>;

    return {
      id: row['id'] as string,
      dreamId: row['dream_id'] as string,
      mediaType: 'video',
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
