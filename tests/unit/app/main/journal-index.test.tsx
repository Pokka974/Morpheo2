import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { sqlite as db } from '@db/client';
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

const mockNavigate = jest.fn();
// The screen listens on the *parent* (tab) navigator for `tabPress`, so the mock has to
// expose getParent(). `mockTabPressListeners` captures what it registers, letting a test
// fire the event the real TabBar emits.
const mockTabPressListeners: Array<() => void> = [];
const mockRemoveListener = jest.fn();

jest.mock('expo-router', () => {
  const ReactActual = require('react');
  return {
    useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), replace: jest.fn() }),
    useNavigation: () => ({
      getParent: () => ({
        addListener: (event: string, cb: () => void) => {
          if (event === 'tabPress') mockTabPressListeners.push(cb);
          return mockRemoveListener;
        },
      }),
    }),
    useFocusEffect: (cb: () => void) => {
      ReactActual.useEffect(() => {
        cb();
      }, []);
    },
  };
});

const mockSearch = jest.fn();
const mockClearSearch = jest.fn();
let mockSearchState: { results: unknown[] | null; isSearching: boolean } = {
  results: null,
  isSearching: false,
};
jest.mock('@features/journal/useJournalSearch', () => ({
  useJournalSearch: () => ({
    results: mockSearchState.results,
    isSearching: mockSearchState.isSearching,
    search: mockSearch,
    clearSearch: mockClearSearch,
  }),
}));

const mockApplyFilters = jest.fn();
const mockClearFilters = jest.fn();
let mockFilterState: {
  filters: { emotion?: string; startDate?: string };
  results: unknown[] | null;
} = { filters: {}, results: null };
jest.mock('@features/journal/useJournalFilters', () => ({
  useJournalFilters: () => ({
    filters: mockFilterState.filters,
    results: mockFilterState.results,
    isFiltering: false,
    applyFilters: mockApplyFilters,
    clearFilters: mockClearFilters,
  }),
}));

const mockSyncPendingDreams = jest.fn();
jest.mock('@features/dream-log/syncService', () => ({
  syncPendingDreams: (...args: unknown[]) => mockSyncPendingDreams(...args),
}));

const mockPullRemoteChanges = jest.fn();
jest.mock('@features/sync/pullService', () => ({
  pullRemoteChanges: (...args: unknown[]) => mockPullRemoteChanges(...args),
}));

// FlashList requires real on-screen layout measurement to render items, which
// jsdom/RN-test-renderer never provides — swap in a plain-map renderer so the
// screen's own item-mapping logic is what's under test, not FlashList internals.
// The pull-to-refresh props are captured on the module-level ref below so a test
// can trigger `onRefresh` directly, the way a real pull gesture would.
let capturedFlashListProps: { onRefresh?: () => void; refreshing?: boolean } = {};
// The screen holds a ref to scroll the list back to the top on a tab press, so the stand-in
// has to forward one and expose scrollToOffset for the assertion.
const mockScrollToOffset = jest.fn();
jest.mock('@shopify/flash-list', () => {
  const ReactActual = require('react');
  return {
    FlashList: ReactActual.forwardRef(
      (
        props: {
          data: unknown[];
          renderItem: (info: { item: unknown; index: number }) => React.ReactElement;
          keyExtractor?: (item: unknown, index: number) => string;
          onRefresh?: () => void;
          refreshing?: boolean;
        },
        ref: unknown
      ) => {
        ReactActual.useImperativeHandle(ref, () => ({ scrollToOffset: mockScrollToOffset }));
        capturedFlashListProps = { onRefresh: props.onRefresh, refreshing: props.refreshing };
        return ReactActual.createElement(
          ReactActual.Fragment,
          null,
          props.data.map((item, index) =>
            ReactActual.createElement(
              ReactActual.Fragment,
              { key: props.keyExtractor ? props.keyExtractor(item, index) : index },
              props.renderItem({ item, index })
            )
          )
        );
      }
    ),
  };
});

import JournalListScreen from '@app/(main)/journal/index';

function buildRegistry(auth: ServiceRegistry['auth'] = new MockAuthService()): ServiceRegistry {
  return {
    auth,
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
  };
}

function renderScreen(auth?: ServiceRegistry['auth']) {
  return render(
    <ServicesProvider services={buildRegistry(auth)}>
      <JournalListScreen />
    </ServicesProvider>
  );
}

describe('JournalListScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSearch.mockClear();
    mockClearSearch.mockClear();
    mockSearchState = { results: null, isSearching: false };
    mockApplyFilters.mockClear();
    mockClearFilters.mockClear();
    mockFilterState = { filters: {}, results: null };
    (db.getAllAsync as jest.Mock).mockReset();
    mockSyncPendingDreams.mockReset().mockResolvedValue(undefined);
    mockPullRemoteChanges.mockReset().mockResolvedValue(undefined);
    capturedFlashListProps = {};
    mockScrollToOffset.mockClear();
    mockTabPressListeners.length = 0;
  });

  it('shows a loading state before entries resolve', () => {
    (db.getAllAsync as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { getByText } = renderScreen();
    expect(getByText('Loading your dreams…')).toBeTruthy();
  });

  it('shows the empty-journal state with a CTA when there are no dreams, and navigates to log on press', async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([]);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Your dream journal is empty')).toBeTruthy());
    fireEvent.press(getByText('Log a dream'));
    expect(mockNavigate).toHaveBeenCalledWith('/(main)/log');
  });

  it('renders a card for each dream row returned from SQLite', async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dream-1',
        description: 'I was flying over a forest.',
        occurred_at: '2026-01-01T00:00:00.000Z',
        sync_status: 'synced',
        thumbnail_uri: null,
      },
      {
        id: 'dream-2',
        description: 'A door opened into the sea.',
        occurred_at: '2026-01-02T00:00:00.000Z',
        sync_status: 'local',
        thumbnail_uri: null,
      },
    ]);
    const { getByText } = renderScreen();

    await waitFor(() => {
      expect(getByText('I was flying over a forest.')).toBeTruthy();
      expect(getByText('A door opened into the sea.')).toBeTruthy();
    });
  });

  it("shows the dreamer's own emotions in preference to the AI's reading", async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dream-1',
        description: 'I was flying over a forest.',
        occurred_at: '2026-01-01T00:00:00.000Z',
        sync_status: 'synced',
        thumbnail_uri: null,
        dream_emotions: '["freedom"]',
        emotions: '["anxiety"]',
        interpretation_id: 'interp-1',
      },
    ]);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('freedom')).toBeTruthy());
    expect(queryByText('anxiety')).toBeNull();
  });

  it("falls back to the AI's emotions for a dream logged before the picker existed", async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dream-1',
        description: 'I was flying over a forest.',
        occurred_at: '2026-01-01T00:00:00.000Z',
        sync_status: 'synced',
        thumbnail_uri: null,
        dream_emotions: '[]',
        emotions: '["anxiety"]',
        interpretation_id: 'interp-1',
      },
    ]);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('anxiety')).toBeTruthy());
  });

  it('silently handles a rejected query, leaving entries empty', async () => {
    (db.getAllAsync as jest.Mock).mockRejectedValueOnce(new Error('disk error'));
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Your dream journal is empty')).toBeTruthy());
  });

  it('shows a no-results state when a search yields nothing, and clearing it calls clearSearch', async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([]);
    mockSearchState = { results: [], isSearching: false };
    const { getByText, getByLabelText } = renderScreen();
    await waitFor(() => expect(db.getAllAsync).toHaveBeenCalled());

    act(() => {
      fireEvent.changeText(getByLabelText('Search dreams'), 'castle');
    });
    expect(mockSearch).toHaveBeenCalledWith('castle');

    await waitFor(() => expect(getByText('No dreams match this search')).toBeTruthy());
    fireEvent.press(getByText('Clear search'));
    expect(mockClearSearch).toHaveBeenCalled();
  });

  it('calls clearSearch when the search text is cleared back to empty', async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([]);
    const { getByLabelText } = renderScreen();
    await waitFor(() => expect(db.getAllAsync).toHaveBeenCalled());

    fireEvent.changeText(getByLabelText('Search dreams'), '');
    expect(mockClearSearch).toHaveBeenCalled();
  });

  // Pressing the Journal tab while already inside the Journal stack used to be a silent
  // no-op — `journal` reports as the active tab even from a dream's detail screen, so the
  // TabBar's `if (!active)` guard swallowed the press. It now emits `tabPress` and pops the
  // stack; this screen's half of that contract is returning to the top of the list.
  describe('tab press', () => {
    it('scrolls back to the top of the list when its own tab is pressed', async () => {
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        {
          id: 'dream-1',
          description: 'I was flying over a forest.',
          occurred_at: '2026-01-01T00:00:00.000Z',
          sync_status: 'synced',
          thumbnail_uri: null,
        },
      ]);
      renderScreen();
      await waitFor(() => expect(mockTabPressListeners.length).toBeGreaterThan(0));

      expect(mockScrollToOffset).not.toHaveBeenCalled();
      act(() => {
        mockTabPressListeners.forEach(fire => fire());
      });
      expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    });
  });

  describe('pull-to-refresh', () => {
    it('pushes pending dreams, pulls remote changes, then reloads the list', async () => {
      // A non-empty row keeps the screen on its FlashList branch — an empty result
      // renders the EmptyState instead, which has no pull-to-refresh handle.
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        {
          id: 'dream-1',
          description: 'I was flying over a forest.',
          occurred_at: '2026-01-01T00:00:00.000Z',
          sync_status: 'synced',
          thumbnail_uri: null,
        },
      ]);
      renderScreen();
      await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(1));

      await act(async () => {
        capturedFlashListProps.onRefresh?.();
        await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(2));
      });

      expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1);
      // MockAuthService's default session carries this fixed user id.
      expect(mockPullRemoteChanges).toHaveBeenCalledWith(
        'mock-user-id',
        expect.objectContaining({
          getSignedUrl: expect.any(Function),
          cacheMedia: expect.any(Function),
        })
      );
    });

    it('pushes before it pulls, so an in-flight local edit reaches the server before reconciling down', async () => {
      const order: string[] = [];
      mockSyncPendingDreams.mockImplementation(async () => {
        order.push('push');
      });
      mockPullRemoteChanges.mockImplementation(async () => {
        order.push('pull');
      });
      // A non-empty row keeps the screen on its FlashList branch — an empty result
      // renders the EmptyState instead, which has no pull-to-refresh handle.
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        {
          id: 'dream-1',
          description: 'I was flying over a forest.',
          occurred_at: '2026-01-01T00:00:00.000Z',
          sync_status: 'synced',
          thumbnail_uri: null,
        },
      ]);
      renderScreen();
      await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(1));

      await act(async () => {
        capturedFlashListProps.onRefresh?.();
        await waitFor(() => expect(order).toEqual(['push', 'pull']));
      });
    });

    it('does not push or pull when there is no active session, but still reloads the local list', async () => {
      // A non-empty row keeps the screen on its FlashList branch — an empty result
      // renders the EmptyState instead, which has no pull-to-refresh handle.
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        {
          id: 'dream-1',
          description: 'I was flying over a forest.',
          occurred_at: '2026-01-01T00:00:00.000Z',
          sync_status: 'synced',
          thumbnail_uri: null,
        },
      ]);
      const auth = new MockAuthService().configure('failure');
      renderScreen(auth);
      await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(1));

      await act(async () => {
        capturedFlashListProps.onRefresh?.();
        await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(2));
      });

      expect(mockSyncPendingDreams).not.toHaveBeenCalled();
      expect(mockPullRemoteChanges).not.toHaveBeenCalled();
    });

    it('toggles refreshing on while the sync is in flight and off once it settles', async () => {
      let resolvePull: () => void = () => {};
      mockPullRemoteChanges.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolvePull = resolve;
          })
      );
      // A non-empty row keeps the screen on its FlashList branch — an empty result
      // renders the EmptyState instead, which has no pull-to-refresh handle.
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        {
          id: 'dream-1',
          description: 'I was flying over a forest.',
          occurred_at: '2026-01-01T00:00:00.000Z',
          sync_status: 'synced',
          thumbnail_uri: null,
        },
      ]);
      renderScreen();
      await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(1));

      act(() => {
        capturedFlashListProps.onRefresh?.();
      });
      await waitFor(() => expect(capturedFlashListProps.refreshing).toBe(true));

      act(() => {
        resolvePull();
      });
      await waitFor(() => expect(capturedFlashListProps.refreshing).toBe(false));
    });

    it('still reloads the list even when the pull itself fails', async () => {
      mockPullRemoteChanges.mockRejectedValue(new Error('pull failed'));
      // A non-empty row keeps the screen on its FlashList branch — an empty result
      // renders the EmptyState instead, which has no pull-to-refresh handle.
      (db.getAllAsync as jest.Mock).mockResolvedValue([
        {
          id: 'dream-1',
          description: 'I was flying over a forest.',
          occurred_at: '2026-01-01T00:00:00.000Z',
          sync_status: 'synced',
          thumbnail_uri: null,
        },
      ]);
      renderScreen();
      await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(1));

      await act(async () => {
        capturedFlashListProps.onRefresh?.();
        await waitFor(() => expect(db.getAllAsync).toHaveBeenCalledTimes(2));
      });

      expect(capturedFlashListProps.refreshing).toBe(false);
    });
  });

  describe('filters', () => {
    const ONE_DREAM = [
      {
        id: 'dream-1',
        description: 'I was flying over a forest.',
        occurred_at: '2026-01-01T00:00:00.000Z',
        sync_status: 'synced',
        thumbnail_uri: null,
      },
    ];

    it('opens the filter sheet from the header button', async () => {
      (db.getAllAsync as jest.Mock).mockResolvedValue(ONE_DREAM);
      const { getByTestId, queryByText } = renderScreen();
      await waitFor(() => expect(getByTestId('journal-filter-button')).toBeTruthy());

      expect(queryByText('Apply')).toBeNull();
      fireEvent.press(getByTestId('journal-filter-button'));
      expect(getByTestId('journal-filter-apply')).toBeTruthy();
    });

    it('applies the chosen emotion and period to the filter engine', async () => {
      (db.getAllAsync as jest.Mock).mockResolvedValue(ONE_DREAM);
      const { getByTestId, getByText } = renderScreen();
      await waitFor(() => expect(getByTestId('journal-filter-button')).toBeTruthy());

      fireEvent.press(getByTestId('journal-filter-button'));
      fireEvent.press(getByText('fear'));
      fireEvent.press(getByText('30 d'));
      fireEvent.press(getByTestId('journal-filter-apply'));

      expect(mockApplyFilters).toHaveBeenCalledTimes(1);
      const applied = mockApplyFilters.mock.calls[0][0];
      expect(applied.emotion).toBe('fear');
      expect(applied.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('leaves startDate undefined when the period stays on "All"', async () => {
      (db.getAllAsync as jest.Mock).mockResolvedValue(ONE_DREAM);
      const { getByTestId, getByText } = renderScreen();
      await waitFor(() => expect(getByTestId('journal-filter-button')).toBeTruthy());

      fireEvent.press(getByTestId('journal-filter-button'));
      fireEvent.press(getByText('fear'));
      fireEvent.press(getByTestId('journal-filter-apply'));

      expect(mockApplyFilters).toHaveBeenCalledWith({ emotion: 'fear', startDate: undefined });
    });

    it('names the filters in force as chips, and clears them on demand', async () => {
      mockFilterState = { filters: { emotion: 'fear' }, results: [] };
      (db.getAllAsync as jest.Mock).mockResolvedValue(ONE_DREAM);
      const { getByTestId, getByText } = renderScreen();

      await waitFor(() => expect(getByText('fear')).toBeTruthy());
      fireEvent.press(getByTestId('journal-filters-clear'));
      expect(mockClearFilters).toHaveBeenCalled();
    });

    it('distinguishes a filtered-to-nothing list from an empty journal', async () => {
      mockFilterState = { filters: { emotion: 'fear' }, results: [] };
      (db.getAllAsync as jest.Mock).mockResolvedValue(ONE_DREAM);
      const { getByText, queryByText } = renderScreen();

      await waitFor(() => expect(getByText('No dreams match these filters')).toBeTruthy());
      expect(queryByText('Your dream journal is empty')).toBeNull();
    });

    it('shows no filter chips when nothing is filtered', async () => {
      (db.getAllAsync as jest.Mock).mockResolvedValue(ONE_DREAM);
      const { queryByTestId } = renderScreen();
      await waitFor(() => expect(queryByTestId('journal-filter-button')).toBeTruthy());
      expect(queryByTestId('journal-filters-clear')).toBeNull();
    });
  });
});
