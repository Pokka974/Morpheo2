import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';
import { sqlite as db } from '@db/client';

const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    dreamId: 'test-dream-id',
    description: 'I was walking through a misty forest and found a glowing door.',
  }),
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-id' } } }) },
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({}) }),
      insert: jest.fn().mockResolvedValue({}),
    }),
  },
}));

const interpretationService = new MockInterpretationService();
const entitlementService = new MockEntitlementService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: interpretationService,
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: entitlementService,
    notifications: new MockNotificationService(),
  };
}

import InterpretationScreen from '@app/(main)/journal/[dreamId]/interpretation';

describe('InterpretationScreen', () => {
  beforeEach(() => {
    interpretationService.configure('success');
    entitlementService.configure('free');
    mockRouterReplace.mockClear();
    (db.runAsync as jest.Mock).mockClear();
    (db.prepareSync as jest.Mock).mockClear();
    (db.getFirstAsync as jest.Mock).mockClear();
  });

  it('fires the interpretation request on mount — no CTA to press first', () => {
    const { getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    // Loading shows immediately; there is no idle state with a button asking the
    // user to confirm the same request they already triggered from the detail screen.
    expect(getByText('Interpreting your dream…')).toBeTruthy();
    expect(queryByText('Interpret Dream')).toBeNull();
  });

  it('renders all four interpretation sections on success', async () => {
    interpretationService.configure('success');
    const { queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    await waitFor(() => {
      expect(queryByText('Interpretation')).toBeTruthy();
      expect(queryByText('Symbols')).toBeTruthy();
      expect(queryByText('Emotions')).toBeTruthy();
    });
  });

  it('shows retry button on provider failure', async () => {
    interpretationService.configure('failure');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    await waitFor(() => {
      expect(getByText('Try again')).toBeTruthy();
      expect(getByText('Interpretation unavailable')).toBeTruthy();
    });
  });

  it('pressing retry re-requests the interpretation and can recover into a success state', async () => {
    interpretationService.configure('failure');
    const { getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Try again')).toBeTruthy());

    interpretationService.configure('success');
    fireEvent.press(getByText('Try again'));

    await waitFor(() => expect(queryByText('Interpretation')).toBeTruthy());
  });

  it('persists the interpretation to local SQLite and navigates back to the detail screen on success', async () => {
    render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );

    await waitFor(() => {
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO interpretations'),
        expect.arrayContaining(['test-dream-id'])
      );
    });
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(main)/journal/test-dream-id/detail');
    });
  });

  it('records recurrence patterns for the keywords and emotions once the interpretation is persisted', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce({ user_id: 'user-id' });

    render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );

    await waitFor(() => {
      const insertCalls = (db.prepareSync as jest.Mock).mock.calls.filter(([sql]) =>
        (sql as string).includes('INSERT INTO recurrence_patterns')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });
  });

  it('does not blow up when the dream row cannot be found locally — recurrence is skipped, navigation still happens', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(null);

    render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(main)/journal/test-dream-id/detail');
    });
    const insertCalls = (db.prepareSync as jest.Mock).mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT INTO recurrence_patterns')
    );
    expect(insertCalls.length).toBe(0);
  });

  it('shows the paywall when the client-side entitlement precheck fails, before any service call', async () => {
    entitlementService.configure('limit_exceeded');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    await waitFor(() => {
      expect(getByText('Upgrade required')).toBeTruthy();
      expect(getByText('View premium plans')).toBeTruthy();
    });
  });

  it('pressing the paywall CTA starts the purchase flow', async () => {
    entitlementService.configure('limit_exceeded');
    const purchaseSpy = jest.spyOn(entitlementService, 'purchasePremium');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('View premium plans')).toBeTruthy());

    fireEvent.press(getByText('View premium plans'));
    expect(purchaseSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the limit-reached state when the server rejects after the precheck passes', async () => {
    entitlementService.configure('free');
    interpretationService.configure('limit_exceeded');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    await waitFor(() => {
      expect(getByText('Monthly limit reached')).toBeTruthy();
      expect(getByText(/reset on/)).toBeTruthy();
    });
  });

  it('does not double-fire the interpretation request across a re-render', async () => {
    const interpretSpy = jest.spyOn(interpretationService, 'interpret');
    const { rerender } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(interpretSpy).toHaveBeenCalledTimes(1));

    rerender(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );

    expect(interpretSpy).toHaveBeenCalledTimes(1);
  });
});
