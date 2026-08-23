import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { sqlite as db } from '@db/client';

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

// FlashList requires real on-screen layout measurement to render items, which
// jsdom/RN-test-renderer never provides — swap in a plain-map renderer so the
// screen's own item-mapping logic is what's under test, not FlashList internals.
jest.mock('@shopify/flash-list', () => {
  const ReactActual = require('react');
  return {
    FlashList: (props: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactElement;
      keyExtractor?: (item: unknown, index: number) => string;
    }) =>
      ReactActual.createElement(
        ReactActual.Fragment,
        null,
        props.data.map((item, index) =>
          ReactActual.createElement(
            ReactActual.Fragment,
            { key: props.keyExtractor ? props.keyExtractor(item, index) : index },
            props.renderItem({ item, index })
          )
        )
      ),
  };
});

import JournalListScreen from '@app/(main)/journal/index';

describe('JournalListScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSearch.mockClear();
    mockClearSearch.mockClear();
    mockSearchState = { results: null, isSearching: false };
    (db.getAllAsync as jest.Mock).mockReset();
  });

  it('shows a loading state before entries resolve', () => {
    (db.getAllAsync as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { getByText } = render(<JournalListScreen />);
    expect(getByText('Loading your dreams…')).toBeTruthy();
  });

  it('shows the empty-journal state with a CTA when there are no dreams, and navigates to log on press', async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([]);
    const { getByText } = render(<JournalListScreen />);

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
    const { getByText } = render(<JournalListScreen />);

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
    const { getByText, queryByText } = render(<JournalListScreen />);

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
    const { getByText } = render(<JournalListScreen />);

    await waitFor(() => expect(getByText('anxiety')).toBeTruthy());
  });

  it('silently handles a rejected query, leaving entries empty', async () => {
    (db.getAllAsync as jest.Mock).mockRejectedValueOnce(new Error('disk error'));
    const { getByText } = render(<JournalListScreen />);

    await waitFor(() => expect(getByText('Your dream journal is empty')).toBeTruthy());
  });

  it('shows a no-results state when a search yields nothing, and clearing it calls clearSearch', async () => {
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([]);
    mockSearchState = { results: [], isSearching: false };
    const { getByText, getByLabelText } = render(<JournalListScreen />);
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
    const { getByLabelText } = render(<JournalListScreen />);
    await waitFor(() => expect(db.getAllAsync).toHaveBeenCalled());

    fireEvent.changeText(getByLabelText('Search dreams'), '');
    expect(mockClearSearch).toHaveBeenCalled();
  });
});
