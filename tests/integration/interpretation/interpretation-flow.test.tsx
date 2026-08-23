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
  useRouter: () => ({ replace: mockRouterReplace, back: jest.fn() }),
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

// Every route into this screen converges on the pre-interpretation sync, so it is
// mocked here rather than left to drain a mocked SQLite queue.
const mockSyncDreamForInterpretation = jest.fn().mockResolvedValue(undefined);
jest.mock('@features/dream-log/syncService', () => {
  class DreamNotSyncedError extends Error {
    constructor(id: string) {
      super(`Dream ${id} did not reach the server`);
      this.name = 'DreamNotSyncedError';
    }
  }
  return {
    syncDreamForInterpretation: (...args: unknown[]) => mockSyncDreamForInterpretation(...args),
    syncPendingDreams: jest.fn().mockResolvedValue({ syncedIds: [], failures: [] }),
    DreamNotSyncedError,
  };
});

const { DreamNotSyncedError } = jest.requireMock<{
  DreamNotSyncedError: new (dreamId: string) => Error;
}>('@features/dream-log/syncService');

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
    mockSyncDreamForInterpretation.mockReset().mockResolvedValue(undefined);
    (db.runAsync as jest.Mock).mockClear();
    (db.prepareSync as jest.Mock).mockClear();
    (db.getFirstAsync as jest.Mock).mockReset();
    // The screen makes two different getFirstAsync calls — the dream-count for the
    // wait screen's copy, and the owner lookup before recording recurrence — so the
    // mock dispatches on the SQL rather than on call order.
    (db.getFirstAsync as jest.Mock).mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('COUNT(*)') ? { count: 12 } : null)
    );
  });

  /** Makes the owner lookup succeed, leaving the dream-count call answered as usual. */
  function withDreamOwner(userId: string | null) {
    (db.getFirstAsync as jest.Mock).mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('COUNT(*)') ? { count: 12 } : userId ? { user_id: userId } : null)
    );
  }

  it('fires the interpretation request on mount — no CTA to press first', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    // The wait screen shows immediately; there is no idle state with a button asking
    // the user to confirm the same request they already triggered from the detail screen.
    expect(getByLabelText('Interpreting your dream…')).toBeTruthy();
    expect(getByText('Interpretation in progress')).toBeTruthy();
    expect(queryByText('Interpret Dream')).toBeNull();
  });

  it('names the dream being read and the pipeline stages, instead of a bare spinner', () => {
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );

    // The title is the account's first sentence, clipped — the same derivation the
    // journal card uses, so the dream is named the same way in both places.
    expect(getByText('I was walking through a misty forest and found a glowing…')).toBeTruthy();
    expect(getByText('Account read')).toBeTruthy();
    expect(getByText('Spotting the symbols')).toBeTruthy();
    expect(getByText('Crossing with your recurring themes')).toBeTruthy();
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
    withDreamOwner('user-id');

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
    withDreamOwner(null);

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

  describe('dreams that have not reached the server', () => {
    // `interpretationService` is shared across this file and an earlier test leaves its
    // spy installed, so a fresh spyOn here would inherit that call count. Taking the
    // spy in beforeEach and clearing it makes each case start from zero either way.
    let interpretSpy: jest.SpyInstance;

    beforeEach(() => {
      interpretSpy = jest.spyOn(interpretationService, 'interpret');
      interpretSpy.mockClear();
    });

    afterEach(() => {
      interpretSpy.mockRestore();
    });

    it('pushes the dream to Postgres before asking the Edge Function to interpret it', async () => {
      render(
        <ServicesProvider services={buildRegistry()}>
          <InterpretationScreen />
        </ServicesProvider>
      );

      await waitFor(() =>
        expect(mockSyncDreamForInterpretation).toHaveBeenCalledWith('test-dream-id')
      );
      // The Edge Function inserts against a FK on dreams.id, so the order matters:
      // sync first, interpret second.
      await waitFor(() => expect(interpretSpy).toHaveBeenCalledTimes(1));
      expect(mockSyncDreamForInterpretation.mock.invocationCallOrder[0]).toBeLessThan(
        interpretSpy.mock.invocationCallOrder[0]!
      );
    });

    it('never calls the Edge Function when the dream is still local-only', async () => {
      mockSyncDreamForInterpretation.mockRejectedValueOnce(
        new DreamNotSyncedError('test-dream-id')
      );

      const { findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <InterpretationScreen />
        </ServicesProvider>
      );

      expect(await findByText('This dream is still on your device')).toBeTruthy();
      // Calling it anyway is what produced the foreign-key violation in the logs.
      expect(interpretSpy).not.toHaveBeenCalled();
    });

    it('retries the sync as well as the request, since the network is what fixed itself', async () => {
      mockSyncDreamForInterpretation.mockRejectedValueOnce(
        new DreamNotSyncedError('test-dream-id')
      );

      const { findByText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <InterpretationScreen />
        </ServicesProvider>
      );

      expect(await findByText('This dream is still on your device')).toBeTruthy();
      expect(mockSyncDreamForInterpretation).toHaveBeenCalledTimes(1);

      fireEvent.press(getByText('Try again'));

      await waitFor(() => expect(mockSyncDreamForInterpretation).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith('/(main)/journal/test-dream-id/detail')
      );
    });

    it('falls through to the normal request when the sync fails for some other reason', async () => {
      // An expired session mid-drain is not this screen's to classify — the interpret
      // call runs and reports whatever it hits, rather than blaming the sync.
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSyncDreamForInterpretation.mockRejectedValueOnce(new Error('session expired'));

      render(
        <ServicesProvider services={buildRegistry()}>
          <InterpretationScreen />
        </ServicesProvider>
      );

      await waitFor(() => expect(interpretSpy).toHaveBeenCalledTimes(1));
      consoleError.mockRestore();
    });
  });
});
