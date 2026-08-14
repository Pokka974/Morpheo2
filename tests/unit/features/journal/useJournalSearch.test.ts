import { renderHook, act } from '@testing-library/react-native';
import { useJournalSearch } from '@features/journal/useJournalSearch';

const mockRun = jest.fn();

jest.mock('@db/client', () => ({
  db: {
    run: (...args: unknown[]) => mockRun(...args),
  },
}));

jest.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

const mockRows = [
  { id: 'd1', description: 'Flying over water at dusk', occurredAt: '2026-08-10', syncStatus: 'synced' },
  { id: 'd2', description: 'Standing in a forest', occurredAt: '2026-08-09', syncStatus: 'local' },
];

describe('useJournalSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockRun.mockResolvedValue({ rows: mockRows });
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
    expect(mockRun).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(300); });
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('returns search results after debounce', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => { jest.advanceTimersByTime(300); });

    expect(result.current.results).toHaveLength(2);
  });

  it('clears results when query is empty', () => {
    const { result } = renderHook(() => useJournalSearch());
    act(() => result.current.search(''));
    expect(result.current.results).toBeNull();
  });

  it('clearSearch resets results to null', async () => {
    const { result } = renderHook(() => useJournalSearch());

    act(() => result.current.search('water'));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(result.current.results).not.toBeNull();

    act(() => result.current.clearSearch());
    expect(result.current.results).toBeNull();
  });
});
