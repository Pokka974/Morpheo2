import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';
import { DreamImageActionBar } from '@features/media-generation/DreamImageActionBar';
import { useImageGeneration } from '@features/media-generation/useImageGeneration';
import { renderHook, act } from '@testing-library/react-native';

const imageService = new MockImageGenerationService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: imageService,
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ServicesProvider services={buildRegistry()}>{children}</ServicesProvider>
);

const testParams = {
  dreamId: 'dream-001',
  description: 'Flying over mountains in moonlight',
  keywords: ['mountain', 'moon', 'flight'],
};

describe('Image generation integration', () => {
  beforeEach(() => {
    imageService.configure('success');
  });

  it('transitions from idle → generating → success', async () => {
    const { result } = renderHook(() => useImageGeneration(), { wrapper });
    expect(result.current.state.status).toBe('idle');

    await act(async () => {
      result.current.generate(testParams);
    });

    expect(result.current.state.status).toBe('success');
  });

  it('shows safety_blocked state on content safety error', async () => {
    imageService.configure('safety_blocked');
    const { result } = renderHook(() => useImageGeneration(), { wrapper });

    await act(async () => {
      result.current.generate(testParams);
    });

    expect(result.current.state.status).toBe('safety_blocked');
  });

  it('shows image_limit state on monthly image limit error', async () => {
    imageService.configure('limit_exceeded');
    const { result } = renderHook(() => useImageGeneration(), { wrapper });

    await act(async () => {
      result.current.generate(testParams);
    });

    expect(result.current.state.status).toBe('image_limit');
  });

  it('shows a generic error state when the provider throws a plain Error', async () => {
    jest.spyOn(imageService, 'generateImage').mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useImageGeneration(), { wrapper });

    await act(async () => {
      result.current.generate(testParams);
    });

    expect(result.current.state).toEqual({ status: 'error', message: 'boom' });
  });

  it('falls back to a default error message when a non-Error is thrown', async () => {
    jest.spyOn(imageService, 'generateImage').mockRejectedValueOnce('not-an-error');
    const { result } = renderHook(() => useImageGeneration(), { wrapper });

    await act(async () => {
      result.current.generate(testParams);
    });

    expect(result.current.state).toEqual({ status: 'error', message: 'Image generation failed' });
  });

  it('pre-checks entitlement and short-circuits to image_limit without calling the provider when canGenerateImage() is false', async () => {
    const denyingRegistry = buildRegistry();
    jest.spyOn(denyingRegistry.entitlement, 'canGenerateImage').mockResolvedValue(false);
    const generateSpy = jest.spyOn(denyingRegistry.imageGeneration, 'generateImage');
    generateSpy.mockClear();
    const denyingWrapper = ({ children }: { children: React.ReactNode }) => (
      <ServicesProvider services={denyingRegistry}>{children}</ServicesProvider>
    );
    const { result: deniedResult } = renderHook(() => useImageGeneration(), {
      wrapper: denyingWrapper,
    });

    await act(async () => {
      deniedResult.current.generate(testParams);
    });

    expect(deniedResult.current.state.status).toBe('image_limit');
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('still attempts generation if the entitlement pre-check itself throws (server is the real gate)', async () => {
    const registry = buildRegistry();
    jest
      .spyOn(registry.entitlement, 'canGenerateImage')
      .mockRejectedValue(new Error('network down'));
    const localWrapper = ({ children }: { children: React.ReactNode }) => (
      <ServicesProvider services={registry}>{children}</ServicesProvider>
    );
    const { result } = renderHook(() => useImageGeneration(), { wrapper: localWrapper });

    await act(async () => {
      result.current.generate(testParams);
    });

    expect(result.current.state.status).toBe('success');
  });

  it('regenerate() also runs the entitlement pre-check now — there is no separate per-entry regeneration budget', async () => {
    const registry = buildRegistry();
    const canGenerateSpy = jest.spyOn(registry.entitlement, 'canGenerateImage');
    const localWrapper = ({ children }: { children: React.ReactNode }) => (
      <ServicesProvider services={registry}>{children}</ServicesProvider>
    );
    const { result } = renderHook(() => useImageGeneration(), { wrapper: localWrapper });

    await act(async () => {
      result.current.regenerate(testParams);
    });

    expect(result.current.state.status).toBe('success');
    expect(canGenerateSpy).toHaveBeenCalled();
  });

  it('regenerate() short-circuits to image_limit without calling the provider when canGenerateImage() is false — the same monthly credit gates both actions', async () => {
    const registry = buildRegistry();
    jest.spyOn(registry.entitlement, 'canGenerateImage').mockResolvedValue(false);
    const generateSpy = jest.spyOn(registry.imageGeneration, 'generateImage');
    const localWrapper = ({ children }: { children: React.ReactNode }) => (
      <ServicesProvider services={registry}>{children}</ServicesProvider>
    );
    const { result } = renderHook(() => useImageGeneration(), { wrapper: localWrapper });

    await act(async () => {
      result.current.regenerate(testParams);
    });

    expect(result.current.state.status).toBe('image_limit');
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('reset() returns the state to idle', async () => {
    const { result } = renderHook(() => useImageGeneration(), { wrapper });

    await act(async () => {
      result.current.generate(testParams);
    });
    expect(result.current.state.status).toBe('success');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');
  });

  it('renders a Generate image button (not Regenerate) when no image exists yet, and calls onGenerate', () => {
    const onGenerate = jest.fn();
    const onRegenerate = jest.fn();
    const { getByText, queryByText } = render(
      <DreamImageActionBar
        media={null}
        isGenerating={false}
        canRegenerate={true}
        imagesRemaining={1}
        onGenerate={onGenerate}
        onRegenerate={onRegenerate}
      />
    );

    expect(queryByText(/Regenerate/)).toBeNull();
    fireEvent.press(getByText('Generate image'));
    expect(onGenerate).toHaveBeenCalled();
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it('renders a Retry button (calling onGenerate) when generation previously failed', () => {
    const failedMedia = {
      id: 'media-001',
      dreamId: 'dream-001',
      mediaType: 'image' as const,
      generationStatus: 'failed' as const,
      signedUrl: null,
      localCachePath: null,
      errorMessage: 'Image generation failed — retry or skip',
      createdAt: '2026-08-14T00:00:00Z',
      updatedAt: '2026-08-14T00:00:00Z',
    };
    const onGenerate = jest.fn();
    const { getByText } = render(
      <DreamImageActionBar
        media={failedMedia}
        isGenerating={false}
        canRegenerate={true}
        imagesRemaining={1}
        onGenerate={onGenerate}
        onRegenerate={() => {}}
      />
    );

    fireEvent.press(getByText('Retry'));
    expect(onGenerate).toHaveBeenCalled();
  });

  it('renders the regenerate button with the entitlement-based count, regardless of any per-entry media state', () => {
    const media = {
      id: 'media-001',
      dreamId: 'dream-001',
      mediaType: 'image' as const,
      generationStatus: 'complete' as const,
      signedUrl: 'https://example.com/img.jpg',
      localCachePath: null,
      errorMessage: null,
      createdAt: '2026-08-14T00:00:00Z',
      updatedAt: '2026-08-14T00:00:00Z',
    };

    const onRegenerate = jest.fn();
    const { getByText } = render(
      <DreamImageActionBar
        media={media}
        isGenerating={false}
        canRegenerate={true}
        imagesRemaining={2}
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.press(getByText('Regenerate (2 left)'));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it('shows the unlimited label instead of a count for a premium account (imagesRemaining=null)', () => {
    const media = {
      id: 'media-001',
      dreamId: 'dream-001',
      mediaType: 'image' as const,
      generationStatus: 'complete' as const,
      signedUrl: 'https://example.com/img.jpg',
      localCachePath: null,
      errorMessage: null,
      createdAt: '2026-08-14T00:00:00Z',
      updatedAt: '2026-08-14T00:00:00Z',
    };

    const { getByText, queryByText } = render(
      <DreamImageActionBar
        media={media}
        isGenerating={false}
        canRegenerate={true}
        imagesRemaining={null}
        onRegenerate={() => {}}
      />
    );

    expect(getByText('Regenerate')).toBeTruthy();
    expect(queryByText(/left/)).toBeNull();
  });
});
