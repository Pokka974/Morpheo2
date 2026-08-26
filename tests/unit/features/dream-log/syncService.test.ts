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

import {
  AuthExpiredError,
  DreamNotSyncedError,
  syncDreamForInterpretation,
  syncPendingDreams,
} from '@features/dream-log/syncService';
import type { Dream } from '@db/schema';

const makeDream = (overrides: Partial<Dream>): Dream => ({
  id: 'dream-1',
  userId: 'user-1',
  description: 'A long enough dream description for testing purposes.',
  occurredAt: '2026-08-01T00:00:00.000Z',
  emotions: '[]',
  isLucid: false,
  loggedAt: '2026-08-01T00:00:00.000Z',
  lastModifiedAt: '2026-08-01T00:00:00.000Z',
  isDeleted: false,
  editedSinceInterpretation: false,
  syncStatus: 'local',
  bedtime: null,
  wakeTime: null,
  sleepQuality: null,
  clarity: null,
  lucidity: 'none',
  tone: null,
  dreamEnding: null,
  dreamType: '[]',
  characters: '[]',
  places: '[]',
  linkedDreamId: null,
  dayStress: null,
  presleepSubstances: '[]',
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

  it('unpacks the locally-stringified emotions into the Postgres TEXT[] the column expects', async () => {
    mockGetPendingDreams.mockResolvedValue([
      makeDream({ emotions: '["calm","freedom"]', isLucid: true }),
    ]);
    mockUpsert.mockResolvedValue({ error: null });

    await syncPendingDreams();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ emotions: ['calm', 'freedom'], is_lucid: true }),
      expect.anything()
    );
  });

  it('syncs a dream with an unreadable emotions payload as empty, rather than stalling the queue', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-bad', emotions: 'not json' })]);
      mockUpsert.mockResolvedValue({ error: null });

      await syncPendingDreams();

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ emotions: [] }),
        expect.anything()
      );
      // The dream still leaves the queue — losing the emotion list is not worth
      // stranding the account itself.
      expect(mockMarkSynced).toHaveBeenCalledWith('dream-bad');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('maps the sleep/dream/who-where metadata fields to their snake_case columns', async () => {
    mockGetPendingDreams.mockResolvedValue([
      makeDream({
        bedtime: '23:10',
        wakeTime: '07:05',
        sleepQuality: 4,
        clarity: 5,
        lucidity: 'full',
        tone: 'positive',
        dreamEnding: 'resolved',
        dreamType: '["nightmare","recurring"]',
        characters: '["ma mère"]',
        places: '["hôtel"]',
        linkedDreamId: 'dream-earlier',
      }),
    ]);
    mockUpsert.mockResolvedValue({ error: null });

    await syncPendingDreams();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        bedtime: '23:10',
        wake_time: '07:05',
        sleep_quality: 4,
        clarity: 5,
        lucidity: 'full',
        tone: 'positive',
        dream_ending: 'resolved',
        dream_type: ['nightmare', 'recurring'],
        characters: ['ma mère'],
        places: ['hôtel'],
        linked_dream_id: 'dream-earlier',
      }),
      expect.anything()
    );
  });

  it('never sends day_stress or presleep_substances — the private "Contexte personnel" block stays local-only', async () => {
    mockGetPendingDreams.mockResolvedValue([
      makeDream({ dayStress: 4, presleepSubstances: '["alcohol"]' }),
    ]);
    mockUpsert.mockResolvedValue({ error: null });

    await syncPendingDreams();

    const payload = mockUpsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('day_stress');
    expect(payload).not.toHaveProperty('presleep_substances');
  });

  it('drops non-string entries rather than sending them to a TEXT[] column', async () => {
    mockGetPendingDreams.mockResolvedValue([makeDream({ emotions: '["calm",7,null]' })]);
    mockUpsert.mockResolvedValue({ error: null });

    await syncPendingDreams();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ emotions: ['calm'] }),
      expect.anything()
    );
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

  it('reports a non-auth failure in the outcome instead of resolving as though it worked', async () => {
    mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
    mockUpsert.mockResolvedValue({ error: { message: 'constraint violation' } });

    const outcome = await syncPendingDreams();

    // The drain still resolves — the queue is offline-first and retries — but the
    // caller can now tell that this dream did not make it.
    expect(outcome.syncedIds).toEqual([]);
    expect(outcome.failures).toEqual([
      { dreamId: 'dream-x', error: expect.objectContaining({ message: 'constraint violation' }) },
    ]);
    expect(mockMarkSynced).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Dream sync failed for', 'dream-x', expect.anything());
  });

  it('reports which dreams did reach the server', async () => {
    mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
    mockUpsert.mockResolvedValue({ error: null });

    const outcome = await syncPendingDreams();

    expect(outcome.syncedIds).toEqual(['dream-x']);
    expect(outcome.failures).toEqual([]);
  });

  describe('syncDreamForInterpretation', () => {
    it('resolves once the dream has reached Postgres', async () => {
      mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
      mockUpsert.mockResolvedValue({ error: null });

      await expect(syncDreamForInterpretation('dream-x')).resolves.toBeUndefined();
    });

    it('throws when the dream is still local-only, rather than letting the Edge Function hit a foreign-key violation', async () => {
      mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
      mockUpsert.mockResolvedValue({ error: { message: 'column "emotions" does not exist' } });

      await expect(syncDreamForInterpretation('dream-x')).rejects.toBeInstanceOf(
        DreamNotSyncedError
      );
    });

    it('carries the underlying reason, so the failure is diagnosable', async () => {
      mockGetPendingDreams.mockResolvedValue([makeDream({ id: 'dream-x' })]);
      mockUpsert.mockResolvedValue({ error: { message: 'boom' } });

      await expect(syncDreamForInterpretation('dream-x')).rejects.toMatchObject({
        dreamId: 'dream-x',
        reason: expect.objectContaining({ message: 'boom' }),
      });
    });

    it('ignores another dream failing — only this one has to have landed', async () => {
      mockGetPendingDreams.mockResolvedValue([
        makeDream({ id: 'other', loggedAt: '2026-08-01T00:00:00.000Z' }),
        makeDream({ id: 'mine', loggedAt: '2026-08-02T00:00:00.000Z' }),
      ]);
      mockUpsert
        .mockResolvedValueOnce({ error: { message: 'boom' } })
        .mockResolvedValueOnce({ error: null });

      await expect(syncDreamForInterpretation('mine')).resolves.toBeUndefined();
    });
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
