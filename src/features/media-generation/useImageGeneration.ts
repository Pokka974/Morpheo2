import { useState, useCallback } from 'react';
import { useServices } from '@services/useServices';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';
import { ContentSafetyError, RegenerationLimitError, ImageLimitError } from '@services/ai/image/ImageGenerationService';

type ImageState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'success'; media: MediaResult }
  | { status: 'safety_blocked' }
  | { status: 'regeneration_limit'; max: number }
  | { status: 'image_limit'; resetDate: Date }
  | { status: 'error'; message: string };

interface GenerateImageParams {
  dreamId: string;
  description: string;
  keywords: string[];
  isRegeneration?: boolean;
}

export function useImageGeneration() {
  const services = useServices();
  const { imageGeneration } = services;
  const [state, setState] = useState<ImageState>({ status: 'idle' });

  const generate = useCallback(async (params: GenerateImageParams) => {
    setState({ status: 'generating' });

    // Entitlement pre-check (UX guard; server re-checks as the actual gate)
    if (!params.isRegeneration) {
      try {
        const canGenerate = await services.entitlement.canGenerateImage();
        if (!canGenerate) {
          setState({ status: 'image_limit', resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
          return;
        }
      } catch {
        // If entitlement check fails, attempt the call; server will gate
      }
    }

    try {
      const result = await imageGeneration.generateImage(params);
      setState({ status: 'success', media: result });
    } catch (err) {
      if (err instanceof ContentSafetyError) {
        setState({ status: 'safety_blocked' });
      } else if (err instanceof RegenerationLimitError) {
        setState({ status: 'regeneration_limit', max: err.max });
      } else if (err instanceof ImageLimitError) {
        setState({ status: 'image_limit', resetDate: err.resetDate });
      } else {
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Image generation failed' });
      }
    }
  }, [imageGeneration]);

  const regenerate = useCallback(async (params: Omit<GenerateImageParams, 'isRegeneration'>) => {
    await generate({ ...params, isRegeneration: true });
  }, [generate]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, generate, regenerate, reset };
}
