import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';
import { useVideoGeneration } from '@features/media-generation/useVideoGeneration';
import { VideoGenerationButton } from '@features/media-generation/VideoGenerationButton';

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: jest.fn(),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-001' } } }) },
  },
}));

const videoService = new MockVideoGenerationService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: videoService,
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
  description: 'Walking through a glowing forest at dawn',
  keywords: ['forest', 'glow', 'dawn'],
};

describe('Video generation integration', () => {
  beforeEach(() => {
    videoService.configure('success');
  });

  it('transitions from idle → submitting → processing', async () => {
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });
    expect(result.current.state.status).toBe('idle');

    await act(async () => {
      result.current.submit(testParams);
    });

    expect(['processing', 'submitting', 'complete']).toContain(result.current.state.status);
  });

  it('shows premium_required state when not premium', async () => {
    videoService.configure('premium_required');
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });

    expect(result.current.state.status).toBe('premium_required');
  });

  it('VideoGenerationButton shows upgrade option when premium required', async () => {
    const state = { status: 'premium_required' as const };
    const onUpgrade = jest.fn();

    const { getByText } = render(
      <VideoGenerationButton state={state} onSubmit={() => {}} onUpgrade={onUpgrade} />
    );

    fireEvent.press(getByText(/Upgrade to Generate Video/));
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('VideoGenerationButton shows processing state with estimated time', () => {
    const state = {
      status: 'processing' as const,
      job: { jobId: 'job-001', mediaId: 'media-001', status: 'processing' as const, estimatedDurationSeconds: 120 },
    };

    const { getByText } = render(
      <VideoGenerationButton state={state} onSubmit={() => {}} onUpgrade={() => {}} />
    );

    expect(getByText(/2 min/)).toBeTruthy();
  });
});
