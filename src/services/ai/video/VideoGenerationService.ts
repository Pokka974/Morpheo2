import type { MediaResult } from '../image/ImageGenerationService';

export interface VideoGenerationRequest {
  dreamId: string;
  description: string;
  keywords: string[];
  isRegeneration?: boolean;
}

export interface VideoJob {
  jobId: string;
  mediaId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  estimatedDurationSeconds: number;
}

export interface VideoGenerationService {
  submitVideoJob(request: VideoGenerationRequest): Promise<VideoJob>;
  getJobStatus(jobId: string): Promise<VideoJob>;
  getVideo(dreamId: string): Promise<MediaResult | null>;
}

export class PremiumRequiredError extends Error {
  constructor() {
    super('Video generation requires a premium subscription');
    this.name = 'PremiumRequiredError';
  }
}
