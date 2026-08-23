import { renderHook, act } from '@testing-library/react-native';
import { useJournalFilters } from '@features/journal/useJournalFilters';

const mockPrepareSync = jest.fn();
const mockExecuteSync = jest.fn();

jest.mock('@db/client', () => ({
  sqlite: {
    prepareSync: (...args: unknown[]) => {
      mockPrepareSync(...args);
      return { executeSync: mockExecuteSync };
    },
  },
}));

const emotionRows = [
  { id: 'd1', description: 'Dark ocean dream', occurredAt: '2026-08-10', syncStatus: 'synced' },
];

const dateRows = [
  { id: 'd2', description: 'Mountain dream', occurredAt: '2026-08-08', syncStatus: 'synced' },
];

describe('useJournalFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with no filters and null results', () => {
    const { result } = renderHook(() => useJournalFilters());
    expect(result.current.filters).toEqual({});
    expect(result.current.results).toBeNull();
  });

  it('filters by emotion using json_each subquery', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters());

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('json_each'));
    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('je.value = ?'));
    expect(result.current.results).toHaveLength(1);
  });

  it('matches the dreamer\'s own emotions as well as the AI\'s reading', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters());

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });

    const query = mockPrepareSync.mock.calls[0][0] as string;
    // A dream the dreamer tagged as frightening must surface even before it has an
    // interpretation, so both lists are searched.
    expect(query).toContain('json_each(i.emotions)');
    expect(query).toContain('json_each(d.emotions)');
    // Both subqueries are bound, in order.
    expect(mockExecuteSync).toHaveBeenCalledWith(['fear', 'fear']);
  });

  it('filters by date range', async () => {
    mockExecuteSync.mockReturnValue(dateRows);
    const { result } = renderHook(() => useJournalFilters());

    await act(async () => {
      result.current.applyFilters({ startDate: '2026-08-01', endDate: '2026-08-14' });
    });

    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('occurred_at >= ?'));
    expect(mockPrepareSync).toHaveBeenCalledWith(expect.stringContaining('occurred_at <= ?'));
    expect(result.current.results).toHaveLength(1);
  });

  it('does NOT use PostgreSQL array syntax', async () => {
    mockExecuteSync.mockReturnValue([]);
    const { result } = renderHook(() => useJournalFilters());

    await act(async () => {
      result.current.applyFilters({ emotion: 'joy' });
    });

    const query = mockPrepareSync.mock.calls[0][0] as string;
    expect(query).not.toContain('@>');
    expect(query).not.toContain('ARRAY');
  });

  it('combined emotion + date range filter builds correct WHERE clause', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters());

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear', startDate: '2026-08-01', endDate: '2026-08-14' });
    });

    const query = mockPrepareSync.mock.calls[0][0] as string;
    expect(query).toContain('json_each');
    expect(query).toContain('occurred_at >= ?');
    expect(query).toContain('occurred_at <= ?');
  });

  it('clearFilters resets to empty state', async () => {
    mockExecuteSync.mockReturnValue(emotionRows);
    const { result } = renderHook(() => useJournalFilters());

    await act(async () => {
      result.current.applyFilters({ emotion: 'fear' });
    });
    expect(result.current.results).not.toBeNull();

    act(() => result.current.clearFilters());
    expect(result.current.filters).toEqual({});
    expect(result.current.results).toBeNull();
  });
});
