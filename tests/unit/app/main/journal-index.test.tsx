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
jest.mock('expo-router', () => {
  const ReactActual = require('react');
  return {
    useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), replace: jest.fn() }),
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

jest.mock('@features/journal/useJournalFilters', () => ({
  useJournalFilters: () => ({
    filters: {},
    results: null,
    isFiltering: false,
    applyFilters: jest.fn(),
    clearFilters: jest.fn(),
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
jest.mock('@shopify/flash-list', () => {
  const ReactActual = require('react');
  return {
    FlashList: (props: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactElement;
      keyExtractor?: (item: unknown, index: number) => string;
      onRefresh?: () => void;
      refreshing?: boolean;
    }) => {
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
    },
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
    (db.getAllAsync as jest.Mock).mockReset();
    mockSyncPendingDreams.mockReset().mockResolvedValue(undefined);
    mockPullRemoteChanges.mockReset().mockResolvedValue(undefined);
    capturedFlashListProps = {};
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
      expect(mockPullRemoteChanges).toHaveBeenCalledWith('mock-user-id');
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
});
