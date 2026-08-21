import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
import { DreamMediaView } from '@features/media-generation/DreamMediaView';
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

  it('shows regen_limit state on regeneration limit error', async () => {
    imageService.configure('regeneration_limit');
    const { result } = renderHook(() => useImageGeneration(), { wrapper });

    await act(async () => {
      result.current.regenerate(testParams);
    });

    expect(result.current.state.status).toBe('regeneration_limit');
  });

  it('renders DreamMediaView with image on success', async () => {
    const successMedia = {
      id: 'media-001',
      dreamId: 'dream-001',
      mediaType: 'image' as const,
      generationStatus: 'complete' as const,
      signedUrl: 'https://example.com/img.jpg',
      localCachePath: null,
      regenerationCount: 0,
      maxRegenerations: 3,
      errorMessage: null,
      createdAt: '2026-08-14T00:00:00Z',
      updatedAt: '2026-08-14T00:00:00Z',
    };

    const { getByLabelText } = render(
      <DreamMediaView
        media={successMedia}
        isGenerating={false}
        canRegenerate={true}
        onRegenerate={() => {}}
      />
    );

    expect(getByLabelText('Dream illustration')).toBeTruthy();
  });

  it('renders a Generate Image button (not Regenerate) when no image exists yet, and calls onGenerate', () => {
    const onGenerate = jest.fn();
    const onRegenerate = jest.fn();
    const { getByText, queryByText } = render(
      <DreamMediaView
        media={null}
        isGenerating={false}
        canRegenerate={true}
        onGenerate={onGenerate}
        onRegenerate={onRegenerate}
      />
    );

    expect(queryByText(/Regenerate/)).toBeNull();
    fireEvent.press(getByText('Generate Image'));
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
      regenerationCount: 0,
      maxRegenerations: 3,
      errorMessage: 'Image generation failed — retry or skip',
      createdAt: '2026-08-14T00:00:00Z',
      updatedAt: '2026-08-14T00:00:00Z',
    };
    const onGenerate = jest.fn();
    const { getByText } = render(
      <DreamMediaView
        media={failedMedia}
        isGenerating={false}
        canRegenerate={true}
        onGenerate={onGenerate}
        onRegenerate={() => {}}
      />
    );

    fireEvent.press(getByText('Retry'));
    expect(onGenerate).toHaveBeenCalled();
  });

  it('renders regenerate button when regenerations remain', () => {
    const media = {
      id: 'media-001',
      dreamId: 'dream-001',
      mediaType: 'image' as const,
      generationStatus: 'complete' as const,
      signedUrl: 'https://example.com/img.jpg',
      localCachePath: null,
      regenerationCount: 1,
      maxRegenerations: 3,
      errorMessage: null,
      createdAt: '2026-08-14T00:00:00Z',
      updatedAt: '2026-08-14T00:00:00Z',
    };

    const onRegenerate = jest.fn();
    const { getByText } = render(
      <DreamMediaView
        media={media}
        isGenerating={false}
        canRegenerate={true}
        onRegenerate={onRegenerate}
      />
    );

    fireEvent.press(getByText(/Regenerate/));
    expect(onRegenerate).toHaveBeenCalled();
  });
});
