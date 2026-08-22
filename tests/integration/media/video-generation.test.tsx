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

let capturedOnHandler: ((payload: { new: { status: string; id: string } }) => void) | null = null;
const mockRemoveChannel = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockImplementation((_event, _filter, handler) => {
        capturedOnHandler = handler;
        return { subscribe: jest.fn().mockReturnThis() };
      }),
      subscribe: jest.fn().mockReturnThis(),
    }),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
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
    capturedOnHandler = null;
    mockRemoveChannel.mockClear();
  });

  it('shows a generic failed state when the provider throws a plain Error', async () => {
    jest.spyOn(videoService, 'submitVideoJob').mockRejectedValueOnce(new Error('provider down'));
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });

    expect(result.current.state).toEqual({ status: 'failed', message: 'provider down' });
  });

  it('falls back to a default failure message when a non-Error is thrown', async () => {
    jest.spyOn(videoService, 'submitVideoJob').mockRejectedValueOnce('nope');
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });

    expect(result.current.state).toEqual({ status: 'failed', message: 'Failed to submit video job' });
  });

  it('realtime update to "complete" transitions state and unsubscribes the channel', async () => {
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });
    expect(capturedOnHandler).not.toBeNull();

    act(() => {
      capturedOnHandler!({ new: { status: 'complete', id: 'job-x' } });
    });

    expect(result.current.state.status).toBe('complete');
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('realtime update to "failed" transitions state and unsubscribes the channel', async () => {
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });
    expect(capturedOnHandler).not.toBeNull();

    act(() => {
      capturedOnHandler!({ new: { status: 'failed', id: 'job-x' } });
    });

    expect(result.current.state).toEqual({ status: 'failed', message: 'Video generation failed' });
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('realtime update to an intermediate status keeps state at "processing"', async () => {
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });

    act(() => {
      capturedOnHandler!({ new: { status: 'processing', id: 'job-x' } });
    });

    expect(result.current.state.status).toBe('processing');
    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  it('reset() cleans up the realtime channel and returns state to idle', async () => {
    const { result } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });
    expect(result.current.state.status).not.toBe('idle');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe('idle');
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('unmounting the hook cleans up the realtime channel', async () => {
    const { result, unmount } = renderHook(() => useVideoGeneration(), { wrapper });

    await act(async () => {
      result.current.submit(testParams);
    });

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
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

  it('VideoGenerationButton idle state renders a Generate button that calls onSubmit', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <VideoGenerationButton state={{ status: 'idle' }} onSubmit={onSubmit} onUpgrade={() => {}} />
    );

    fireEvent.press(getByText('Generate Dream Video'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('VideoGenerationButton submitting state shows a spinner and "Submitting..." text', () => {
    const { getByText } = render(
      <VideoGenerationButton state={{ status: 'submitting' }} onSubmit={() => {}} onUpgrade={() => {}} />
    );
    expect(getByText('Submitting...')).toBeTruthy();
  });

  it('VideoGenerationButton complete state shows "Video ready!"', () => {
    const state = {
      status: 'complete' as const,
      job: { jobId: 'job-001', mediaId: 'media-001', status: 'complete' as const, estimatedDurationSeconds: 0 },
    };
    const { getByText } = render(
      <VideoGenerationButton state={state} onSubmit={() => {}} onUpgrade={() => {}} />
    );
    expect(getByText('Video ready!')).toBeTruthy();
  });

  it('VideoGenerationButton failed state shows the error message and a Retry that calls onSubmit', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <VideoGenerationButton
        state={{ status: 'failed', message: 'Something broke' }}
        onSubmit={onSubmit}
        onUpgrade={() => {}}
      />
    );

    expect(getByText('Something broke')).toBeTruthy();
    fireEvent.press(getByText('Retry'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
