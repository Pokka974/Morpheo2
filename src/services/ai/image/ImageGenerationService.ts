export type GenerationStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'safety_blocked';

export interface MediaResult {
  id: string;
  dreamId: string;
  mediaType: 'image' | 'video';
  generationStatus: GenerationStatus;
  signedUrl: string | null;
  localCachePath: string | null;
  /**
   * Per-entry regeneration budget — still real for the dormant Luma video path
   * (`LumaVideoGenerationService` populates both from the `media` row), but retired for
   * images: `generate-image` no longer enforces or returns either, so an image result
   * never carries them. "Regenerate" for images is bounded by the monthly image
   * entitlement instead (`EntitlementService.canGenerateImage`), not a per-image count.
   */
  regenerationCount?: number;
  maxRegenerations?: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenerationRequest {
  dreamId: string;
  description: string;
  keywords: string[];
  isRegeneration?: boolean;
}

export interface ImageGenerationService {
  generateImage(request: ImageGenerationRequest): Promise<MediaResult>;
  getImage(dreamId: string): Promise<MediaResult | null>;
  getSignedUrl(mediaId: string): Promise<string>;
}

export class ContentSafetyError extends Error {
  constructor(public readonly layer: 'input' | 'output') {
    super(`Content safety check failed at ${layer} layer`);
    this.name = 'ContentSafetyError';
  }
}

export class ImageLimitError extends Error {
  constructor(public readonly resetDate: Date) {
    super('Monthly image generation limit reached');
    this.name = 'ImageLimitError';
  }
}

export class ImageGenerationProviderError extends Error {
  constructor(public readonly retryable: boolean) {
    super('Image generation provider unavailable');
    this.name = 'ImageGenerationProviderError';
  }
}
