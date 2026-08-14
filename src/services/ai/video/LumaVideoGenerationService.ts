import { supabase } from '../../../supabase/client';
import type { VideoGenerationService, VideoGenerationRequest, VideoJob } from './VideoGenerationService';
import { PremiumRequiredError } from './VideoGenerationService';
import type { MediaResult } from '../image/ImageGenerationService';

export class LumaVideoGenerationService implements VideoGenerationService {
  async submitVideoJob(request: VideoGenerationRequest): Promise<VideoJob> {
    const { data, error } = await supabase.functions.invoke('generate-video', {
      body: request,
    });

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

    return {
      jobId: data['id'] as string,
      mediaId: data['media_id'] as string,
      status: data['status'] as VideoJob['status'],
      estimatedDurationSeconds: data['estimated_duration_seconds'] as number,
    };
  }

  async getVideo(dreamId: string): Promise<MediaResult | null> {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .eq('dream_id', dreamId)
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      id: data['id'] as string,
      dreamId: data['dream_id'] as string,
      mediaType: 'video',
      generationStatus: data['generation_status'] as MediaResult['generationStatus'],
      signedUrl: null,
      localCachePath: null,
      regenerationCount: data['regeneration_count'] as number,
      maxRegenerations: data['max_regenerations'] as number,
      errorMessage: data['error_message'] as string | null,
      createdAt: data['created_at'] as string,
      updatedAt: data['updated_at'] as string,
    };
  }
}
