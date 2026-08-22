const mockUpsert = jest.fn();
const mockGetPendingDreams = jest.fn();
const mockMarkSynced = jest.fn();

// Mock supabase client before import to avoid env var validation throwing
jest.mock('@features/../supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({ upsert: (...args: unknown[]) => mockUpsert(...args) })),
  },
}));

jest.mock('@features/dream-log/dreamRepository', () => ({
  getPendingDreams: (...args: unknown[]) => mockGetPendingDreams(...args),
  markSynced: (...args: unknown[]) => mockMarkSynced(...args),
}));

import { AuthExpiredError, syncPendingDreams } from '@features/dream-log/syncService';
import type { Dream } from '@db/schema';

const makeDream = (overrides: Partial<Dream>): Dream => ({
  id: 'dream-1',
  userId: 'user-1',
  description: 'A long enough dream description for testing purposes.',
  occurredAt: '2026-08-01T00:00:00.000Z',
  loggedAt: '2026-08-01T00:00:00.000Z',
  lastModifiedAt: '2026-08-01T00:00:00.000Z',
  isDeleted: false,
  editedSinceInterpretation: false,
  syncStatus: 'local',
  ...overrides,
});

describe('AuthExpiredError', () => {
  it('is an instance of Error', () => {
    const error = new AuthExpiredError();
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const error = new AuthExpiredError();
    expect(error.name).toBe('AuthExpiredError');
  });

  it('has a descriptive message', () => {
    const error = new AuthExpiredError();
    expect(error.message).toContain('expired');
  });
});

describe('syncPendingDreams', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockUpsert.mockReset();
    mockGetPendingDreams.mockReset();
    mockMarkSynced.mockReset().mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns immediately without calling supabase when there are no pending dreams', async () => {
    mockGetPendingDreams.mockResolvedValue([]);

    await syncPendingDreams();

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('syncs dreams oldest-first by loggedAt, and marks each synced on success', async () => {
    mockGetPendingDreams.mockResolvedValue([
      makeDream({ id: 'newer', loggedAt: '2026-08-02T00:00:00.000Z' }),
      makeDream({ id: 'older', loggedAt: '2026-08-01T00:00:00.000Z' }),
    ]);
    mockUpsert.mockResolvedValue({ error: null });

    await syncPendingDreams();

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockMarkSynced).toHaveBeenNthCalledWith(1, 'older');
    expect(mockMarkSynced).toHaveBeenNthCalledWith(2, 'newer');
  });

  it('maps dream fields to the snake_case upsert payload with onConflict: id', async () => {
    const dream = makeDream({ id: 'dream-x' });
    mockGetPendingDreams.mockResolvedValue([dream]);
    mockUpsert.mockResolvedValue({ error: null });

    await syncPendingDreams();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dream-x',
        user_id: dream.userId,
        occurred_at: dream.occurredAt,
        logged_at: dream.loggedAt,
        last_modified_at: dream.lastModifiedAt,
        is_deleted: dream.isDeleted,
        edited_since_interpretation: dream.editedSinceInterpretation,
      }),
      { onConflict: 'id', ignoreDuplicates: false }
    );
    expect(mockMarkSynced).toHaveBeenCalledWith('dream-x');
  });

  it('throws AuthExpiredError (and stops syncing) when the upsert errors with code PGRST301', async () => {
    mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
    mockUpsert.mockResolvedValue({ error: { code: 'PGRST301', message: 'jwt expired' } });

    await expect(syncPendingDreams()).rejects.toThrow(AuthExpiredError);
    expect(mockMarkSynced).not.toHaveBeenCalled();
  });

  it('throws AuthExpiredError when the error message mentions 401', async () => {
    mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
    mockUpsert.mockResolvedValue({ error: { message: 'Unauthorized: 401' } });

    await expect(syncPendingDreams()).rejects.toThrow(AuthExpiredError);
  });

  it('swallows a non-auth error, logs it, and does not mark the dream synced (retried next cycle)', async () => {
    mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
    mockUpsert.mockResolvedValue({ error: { message: 'constraint violation' } });

    await expect(syncPendingDreams()).resolves.toBeUndefined();
    expect(mockMarkSynced).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Dream sync failed for', 'dream-x', expect.anything());
  });

  it('continues syncing subsequent dreams after a non-auth failure on an earlier one', async () => {
    mockGetPendingDreams.mockResolvedValue([
      makeDream({ id: 'fails', loggedAt: '2026-08-01T00:00:00.000Z' }),
      makeDream({ id: 'succeeds', loggedAt: '2026-08-02T00:00:00.000Z' }),
    ]);
    mockUpsert
      .mockResolvedValueOnce({ error: { message: 'constraint violation' } })
      .mockResolvedValueOnce({ error: null });

    await syncPendingDreams();

    expect(mockMarkSynced).toHaveBeenCalledTimes(1);
    expect(mockMarkSynced).toHaveBeenCalledWith('succeeds');
  });
});
