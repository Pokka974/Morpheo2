export type GenerationStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'safety_blocked';

export interface MediaResult {
  id: string;
  dreamId: string;
  mediaType: 'image' | 'video';
  generationStatus: GenerationStatus;
  signedUrl: string | null;
  localCachePath: string | null;
  regenerationCount: number;
  maxRegenerations: number;
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

export class RegenerationLimitError extends Error {
  constructor(public readonly max: number) {
    super(`Regeneration limit of ${max} reached for this entry`);
    this.name = 'RegenerationLimitError';
  }
}

export class ImageLimitError extends Error {
  constructor(public readonly resetDate: Date) {
    super('Monthly image generation limit reached');
    this.name = 'ImageLimitError';
  }
}
