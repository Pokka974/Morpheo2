import type {
  VideoGenerationService,
  VideoGenerationRequest,
  VideoJob,
} from '../VideoGenerationService';
import { PremiumRequiredError } from '../VideoGenerationService';
import type { MediaResult } from '../../image/ImageGenerationService';
import { ContentSafetyError, RegenerationLimitError } from '../../image/ImageGenerationService';

export type MockMode =
  'success' | 'failure' | 'premium_required' | 'safety_blocked' | 'regeneration_limit';

export class MockVideoGenerationService implements VideoGenerationService {
  private mode: MockMode = 'success';

  configure(mode: MockMode) {
    this.mode = mode;
    return this;
  }

  async submitVideoJob(_request: VideoGenerationRequest): Promise<VideoJob> {
    switch (this.mode) {
      case 'success':
        return {
          jobId: 'mock-job-id',
          mediaId: 'mock-media-id',
          status: 'queued',
          estimatedDurationSeconds: 120,
        };
      case 'failure':
        return {
          jobId: 'mock-job-id',
          mediaId: 'mock-media-id',
          status: 'failed',
          estimatedDurationSeconds: 0,
        };
      case 'premium_required':
        throw new PremiumRequiredError();
      case 'safety_blocked':
        throw new ContentSafetyError('input');
      case 'regeneration_limit':
        throw new RegenerationLimitError(1);
    }
  }

  async getJobStatus(_jobId: string): Promise<VideoJob> {
    return {
      jobId: 'mock-job-id',
      mediaId: 'mock-media-id',
      status: this.mode === 'success' ? 'complete' : 'failed',
      estimatedDurationSeconds: 0,
    };
  }

  async getVideo(dreamId: string): Promise<MediaResult | null> {
    if (this.mode !== 'success') return null;
    return {
      id: 'mock-media-id',
      dreamId,
      mediaType: 'video',
      generationStatus: 'complete',
      signedUrl: 'https://example.com/mock-video.mp4',
      localCachePath: null,
      regenerationCount: 0,
      maxRegenerations: 1,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
