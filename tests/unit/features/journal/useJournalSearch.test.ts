import { renderHook, act } from '@testing-library/react-native';
import { useJournalSearch } from '@features/journal/useJournalSearch';

const mockPrepareSync = jest.fn();
const mockExecuteSync = jest.fn();
const mockFinalizeSync = jest.fn();

jest.mock('@db/client', () => ({
  sqlite: {
    prepareSync: (...args: unknown[]) => {
      mockPrepareSync(...args);
      return { executeSync: mockExecuteSync, finalizeSync: mockFinalizeSync };
    },
  },
}));

/** The row shape `journalEntryQuery` selects — the same one the journal list itself
 * reads, which is what keeps a searched dream's card identical to its card in the list. */
const mockRows = [
  {
    id: 'd1',
    description: 'Flying over water at dusk',
    occurred_at: '2026-08-10',
    sync_status: 'synced',
    thumbnail_uri: '/local/cache/media-1.png',
    dream_emotions: '["joy"]',
    interpretation_emotions: '["awe"]',
    interpretation_id: 'i1',
    is_lucid: 1,
    tone: 'positive',
    clarity: 4,
    dream_type: '["recurring"]',
  },
  {
    id: 'd2',
    description: 'Standing in a forest',
    occurred_at: '2026-08-09',
    sync_status: 'local',
    thumbnail_uri: null,
    dream_emotions: '[]',
    interpretation_emotions: null,
    interpretation_id: null,
    is_lucid: 0,
    tone: null,
    clarity: null,
    dream_type: null,
  },
];

describe('useJournalSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockExecuteSync.mockReturnValue(mockRows);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with null results', () => {
    const { result } = renderHook(() => useJournalSearch());
    expect(result.current.results).toBeNull();
  });

  it('debounces search by 300ms', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    expect(mockExecuteSync).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(mockExecuteSync).toHaveBeenCalledTimes(1);
  });

  it('returns search results after debounce', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.results).toHaveLength(2);
  });

  /**
   * The card rendered from a search result is the same `DreamCard` as in the list, so
   * the query has to carry the thumbnail and the markers with it. Selecting only id,
   * description, date and sync status is what made a dream's image vanish the moment
   * it was searched for.
   */
  it('carries the thumbnail and the card markers through', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.results?.[0]).toMatchObject({
      id: 'd1',
      thumbnailUri: '/local/cache/media-1.png',
      emotions: ['joy'],
      hasInterpretation: true,
      isLucid: true,
      tone: 'positive',
      clarity: 4,
      dreamType: ['recurring'],
    });
  });

  it('joins media and interpretations so the thumbnail is actually selectable', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    const [sql] = mockPrepareSync.mock.calls[0] as [string];
    expect(sql).toContain('local_cache_path as thumbnail_uri');
    expect(sql).toContain('LEFT JOIN media m');
  });

  it('finalizes the prepared statement, which runs once per debounced keystroke', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockFinalizeSync).toHaveBeenCalledTimes(1);
  });

  it('clears results when query is empty', () => {
    const { result } = renderHook(() => useJournalSearch());
    act(() => result.current.search(''));
    expect(result.current.results).toBeNull();
  });

  it('clearSearch resets results to null', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current.results).not.toBeNull();

    act(() => result.current.clearSearch());
    expect(result.current.results).toBeNull();
  });
});
