import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    // No deps array: re-runs on every render, standing in for "the screen is
    // always focused" in a test environment that never unmounts/refocuses.
    React.useEffect(effect);
  },
}));

const mockGetUser = jest.fn();
jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
}));

const mockGetTopRecurrences = jest.fn();
jest.mock('@features/recurrence/recurrenceRepository', () => ({
  getTopRecurrences: (...args: unknown[]) => mockGetTopRecurrences(...args),
}));

const entitlementService = new MockEntitlementService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: entitlementService,
    notifications: new MockNotificationService(),
  };
}

import InsightsScreen from '@app/(main)/insights/index';

function pattern(id: string, term: string, patternType: string, count: number, dreamIds: string[]) {
  return {
    id,
    userId: 'user-1',
    term,
    patternType,
    occurrenceCount: count,
    dreamIds,
    lastSeenAt: '2026-08-01T00:00:00.000Z',
  };
}

describe('InsightsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGetUser.mockReset();
    mockGetTopRecurrences.mockReset();
    entitlementService.configure('free');
  });

  it('shows a loading state before the user resolves', () => {
    mockGetUser.mockImplementation(() => new Promise(() => {}));
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );
    expect(getByText('Loading insights…')).toBeTruthy();
  });

  it('resolves out of the loading state when there is no signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );
    // Previously the screen returned early and span forever; the finally block now
    // always clears the loading flag.
    await waitFor(() => expect(queryByText('Loading insights…')).toBeNull());
  });

  it('free tier: shows recurring emotions and the upgrade card, and navigates to the paywall', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockImplementation((_userId: string, type: string) =>
      Promise.resolve(
        type === 'keyword'
          ? [pattern('k1', 'ocean', 'keyword', 4, ['d1'])]
          : [pattern('e1', 'anxiety', 'emotion', 2, ['d1'])]
      )
    );
    entitlementService.configure('free');

    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('anxiety')).toBeTruthy());
    expect(getByText('Full insights — Premium')).toBeTruthy();
    // No period switch for free users — the window is fixed at 30 days.
    expect(() => getByText('90 d')).toThrow();

    fireEvent.press(getByText('View premium plans'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/paywall');
  });

  it('free tier: requests only the top 3 over a fixed 30-day window', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('free');

    render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(mockGetTopRecurrences).toHaveBeenCalled());
    expect(mockGetTopRecurrences).toHaveBeenCalledWith('user-1', 'keyword', 3, 30);
  });

  it('premium tier: offers the period switch and drops the upgrade card', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('premium');

    const { getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Insights')).toBeTruthy());
    expect(queryByText('Full insights — Premium')).toBeNull();
    expect(getByText('90 d')).toBeTruthy();
  });

  it('refreshes premium status when the screen regains focus after a purchase', async () => {
    // The paywall calls router.back() on a successful purchase; without refetching
    // on focus (rather than mount) this screen would keep gating the period switch
    // behind "free", correctly paid for, until the app restarts. Two chained effects
    // (isPremium, then load()) behind a Promise.all of four mocked calls make this
    // slower than most screens under a loaded CI runner, hence the generous timeouts.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('free');

    const { getByText, queryByText, rerender } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Full insights — Premium')).toBeTruthy(), {
      timeout: 10000,
    });

    entitlementService.configure('premium');
    rerender(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(queryByText('Full insights — Premium')).toBeNull(), {
      timeout: 10000,
    });
    expect(getByText('90 d')).toBeTruthy();
  }, 25000);

  it('premium tier: switching the period refetches over the new window', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('premium');

    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('90 d')).toBeTruthy());
    mockGetTopRecurrences.mockClear();
    fireEvent.press(getByText('90 d'));

    await waitFor(() =>
      expect(mockGetTopRecurrences).toHaveBeenCalledWith('user-1', 'keyword', 12, 90)
    );
  });

  it('all-time drops the date filter entirely', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('premium');

    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('All')).toBeTruthy());
    mockGetTopRecurrences.mockClear();
    fireEvent.press(getByText('All'));

    await waitFor(() =>
      expect(mockGetTopRecurrences).toHaveBeenCalledWith('user-1', 'keyword', 12, undefined)
    );
  });

  it('shows the constellation empty state below the three-dream threshold', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockImplementation((_userId: string, type: string) =>
      Promise.resolve(type === 'keyword' ? [pattern('k1', 'ocean', 'keyword', 1, ['d1'])] : [])
    );
    entitlementService.configure('premium');

    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Not enough dreams yet')).toBeTruthy());
  });

  it('keeps the emotion-curve card on screen with an empty state, rather than hiding it', async () => {
    // The old ribbon disappeared entirely below its threshold, so a reader with no
    // tagged dreams never learned the card existed or what would fill it.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('premium');

    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Emotion curve')).toBeTruthy());
    expect(getByText('Not enough tagged dreams yet')).toBeTruthy();
  });
});
