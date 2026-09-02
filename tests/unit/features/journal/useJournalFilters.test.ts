import { renderHook, act } from '@testing-library/react-native';
import { useJournalFilters } from '@features/journal/useJournalFilters';

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

/** The row shape `journalEntryQuery` selects — the same one the journal list reads, so
 * a filtered dream's card is identical to its card in the unfiltered list. */
const emotionRows = [
  {
    id: 'd1',
    description: 'Dark ocean dream',
    occurred_at: '2026-08-10',
    sync_status: 'synced',
    thumbnail_uri: '/local/cache/media-1.png',
    dream_emotions: '["fear"]',
    interpretation_emotions: '["dread"]',
    interpretation_id: 'i1',
    is_lucid: 0,
    tone: 'negative',
    clarity: 3,
    dream_type: '["nightmare"]',
  },
];

const dateRows = [
  {
    id: 'd2',
    description: 'Mountain dream',
    occurred_at: '2026-08-08',
    sync_status: 'synced',
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

describe('useJournalFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with no filters and null results', () => {
    const { result } = renderHook(() => useJournalFilters('user-1'));
    expect(result.current.filters).toEqual({});
    expect(result.current.results).toBeNull();
  });

  it('filters by emotion using json_each subquery', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('json_each'));
    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('je.value = ?'));
    expect(result.current.results).toHaveLength(1);
  });

  it("matches the dreamer's own emotions as well as the AI's reading", async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    const query = mockPrepareSync.mock.calls[0][0] as string;
    // A dream the dreamer tagged as frightening must surface even before it has an
    // interpretation, so both lists are searched. `fi` is the match-any-interpretation
    // join, distinct from the card's `i`, which is pinned to the newest one.
    expect(query).toContain('json_each(fi.emotions)');
    expect(query).toContain('json_each(d.emotions)');
    // The account scope is bound first, then both emotion subqueries, in order.
    expect(mockExecuteSync).toHaveBeenCalledWith(['user-1', 'fear', 'fear']);
  });

  it('scopes the query to the signed-in account', async () => {
    mockExecuteSync.mockReturnValue([]);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ startDate: '2026-08-01' });
    });

    // Local SQLite holds every account that has signed in on this device; without this
    // the filter matched the previous account's dreams too.
    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('d.user_id = ?'));
    expect(mockExecuteSync).toHaveBeenCalledWith(['user-1', '2026-08-01']);
  });

  it('runs no query at all until the session has resolved', async () => {
    mockExecuteSync.mockReturnValue([]);
    const { result } = renderHook(() => useJournalFilters(null));

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    expect(mockPrepareSync).not.toHaveBeenCalled();
    expect(result.current.results).toBeNull();
  });

  it('filters by date range', async () => {
    mockExecuteSync.mockReturnValue(dateRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ startDate: '2026-08-01', endDate: '2026-08-14' });
    });

    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('occurred_at >= ?'));
    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('occurred_at <= ?'));
    expect(result.current.results).toHaveLength(1);
  });

  it('does NOT use PostgreSQL array syntax', async () => {
    mockExecuteSync.mockReturnValue([]);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ emotion: 'joy' });
    });

    const query = mockPrepareSync.mock.calls[0][0] as string;
    expect(query).not.toContain('@>');
    expect(query).not.toContain('ARRAY');
  });

  it('combined emotion + date range filter builds correct WHERE clause', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({
        emotion: 'fear',
        startDate: '2026-08-01',
        endDate: '2026-08-14',
      });
    });

    const query = mockPrepareSync.mock.calls[0][0] as string;
    expect(query).toContain('json_each');
    expect(query).toContain('occurred_at >= ?');
    expect(query).toContain('occurred_at <= ?');
  });

  /** Filtering used to select four columns and drop the thumbnail, so applying any
   * filter blanked the image on every card it returned. */
  it('carries the thumbnail and the card markers through', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    expect(result.current.results?.[0]).toMatchObject({
      id: 'd1',
      occurredAt: '2026-08-10',
      thumbnailUri: '/local/cache/media-1.png',
      emotions: ['fear'],
      hasInterpretation: true,
      tone: 'negative',
      clarity: 3,
      dreamType: ['nightmare'],
    });
  });

  it('finalizes the prepared statement', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    expect(mockFinalizeSync).toHaveBeenCalledTimes(1);
  });

  it('clearFilters resets to empty state', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters('user-1'));

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });
    expect(result.current.results).not.toBeNull();

    act(() => result.current.clearFilters());
    expect(result.current.filters).toEqual({});
    expect(result.current.results).toBeNull();
  });
});
