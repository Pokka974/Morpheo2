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
    expect(getByText('Loading insights...')).toBeTruthy();
  });

  it('stays in the loading state forever when there is no signed-in user (documents current early-return behavior)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(getByText('Loading insights...')).toBeTruthy();
  });

  it('free tier: renders TopRecurrencesView content plus an upgrade card, and navigates to the paywall', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockImplementation((_userId: string, type: string) =>
      Promise.resolve(
        type === 'keyword'
          ? [{ id: 'k1', userId: 'user-1', term: 'ocean', patternType: 'keyword', occurrenceCount: 4, dreamIds: [], lastSeenAt: '' }]
          : [{ id: 'e1', userId: 'user-1', term: 'anxious', patternType: 'emotion', occurrenceCount: 2, dreamIds: [], lastSeenAt: '' }]
      )
    );
    entitlementService.configure('free');

    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('ocean')).toBeTruthy());
    expect(getByText('anxious')).toBeTruthy();
    expect(getByText('Full Insights — Premium')).toBeTruthy();

    fireEvent.press(getByText('View Premium Plans'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/paywall');
  });

  it('premium tier: renders RecurrenceAnalyticsView instead of the free summary', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([]);
    entitlementService.configure('premium');

    const { getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InsightsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('No recurring patterns found for this time range.')).toBeTruthy());
    expect(queryByText('Full Insights — Premium')).toBeNull();
  });
});
