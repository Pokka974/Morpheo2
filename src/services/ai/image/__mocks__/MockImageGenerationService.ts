import type {
  ImageGenerationService,
  ImageGenerationRequest,
  MediaResult,
} from '../ImageGenerationService';
import {
  ContentSafetyError,
  RegenerationLimitError,
  ImageLimitError,
} from '../ImageGenerationService';

export type MockMode =
  'success' | 'failure' | 'safety_blocked' | 'limit_exceeded' | 'regeneration_limit';

const SUCCESS_RESULT: MediaResult = {
  id: 'mock-media-id',
  dreamId: '',
  mediaType: 'image',
  generationStatus: 'complete',
  signedUrl: 'https://example.com/mock-image.png',
  localCachePath: null,
  regenerationCount: 0,
  maxRegenerations: 3,
  errorMessage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export class MockImageGenerationService implements ImageGenerationService {
  private mode: MockMode = 'success';

  configure(mode: MockMode) {
    this.mode = mode;
    return this;
  }

  async generateImage(request: ImageGenerationRequest): Promise<MediaResult> {
    switch (this.mode) {
      case 'success':
        return { ...SUCCESS_RESULT, dreamId: request.dreamId };
      case 'failure':
        return {
          ...SUCCESS_RESULT,
          dreamId: request.dreamId,
          generationStatus: 'failed',
          errorMessage: 'Provider error',
        };
      case 'safety_blocked':
        throw new ContentSafetyError('input');
      case 'limit_exceeded':
        throw new ImageLimitError(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      case 'regeneration_limit':
        throw new RegenerationLimitError(3);
    }
  }

  async getImage(dreamId: string): Promise<MediaResult | null> {
    if (this.mode === 'success') return { ...SUCCESS_RESULT, dreamId };
    return null;
  }

  async getSignedUrl(_mediaId: string): Promise<string> {
    return 'https://example.com/mock-signed-url.png';
  }
}
