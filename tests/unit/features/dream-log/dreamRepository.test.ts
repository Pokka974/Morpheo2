const mockValues = jest.fn();
const mockSelectWhere = jest.fn();
const mockUpdateWhere = jest.fn();
const mockSet = jest.fn((...args: unknown[]) => {
  void args;
  return { where: (...whereArgs: unknown[]) => mockUpdateWhere(...whereArgs) };
});
let mockFromNoWhere: jest.Mock | null = null;
const mockFrom = jest.fn((..._args: unknown[]) => {
  if (mockFromNoWhere) return mockFromNoWhere();
  return { where: (...args: unknown[]) => mockSelectWhere(...args) };
});

const mockRunAsync = jest.fn();
const mockGetAllAsync = jest.fn();
/** Runs the callback immediately, so the ordering of the statements inside a purge
 * transaction shows up in `mockRunAsync`'s call order exactly as written. */
const mockWithTransactionAsync = jest.fn(async (fn: () => Promise<void>) => {
  await fn();
});

jest.mock('@db/client', () => ({
  db: {
    insert: jest.fn(() => ({ values: (...args: unknown[]) => mockValues(...args) })),
    select: jest.fn(() => ({ from: (...args: unknown[]) => mockFrom(...args) })),
    update: jest.fn(() => ({ set: (...args: unknown[]) => mockSet(...args) })),
  },
  sqlite: {
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
    withTransactionAsync: (...args: [() => Promise<void>]) => mockWithTransactionAsync(...args),
  },
}));

import {
  validateForInterpretation,
  saveDream,
  updateDream,
  deleteDream,
  purgeDreamLocally,
  getPendingDreams,
  markSynced,
  getDreams,
} from '@features/dream-log/dreamRepository';
import type { Dream } from '@db/schema';
import type { MediaCacheDeps } from '@features/sync/mediaCache';

// SQLite operations are exercised here against a mocked `db` (chainable insert/select/update),
// isolating dreamRepository's own logic from the real expo-sqlite driver.

const baseDream: Dream = {
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
};

describe('dreamRepository', () => {
  describe('validateForInterpretation', () => {
    it('throws for descriptions shorter than 20 chars', () => {
      expect(() => validateForInterpretation('Short dream')).toThrow(/20 characters/);
    });

    it('throws for empty description', () => {
      expect(() => validateForInterpretation('')).toThrow(/20 characters/);
    });

    it('throws for whitespace-only description', () => {
      expect(() => validateForInterpretation('   ')).toThrow(/20 characters/);
    });

    it('passes for descriptions of exactly 20 characters', () => {
      expect(() => validateForInterpretation('12345678901234567890')).not.toThrow();
    });

    it('passes for long, rich descriptions', () => {
      const description =
        'I was walking through a forest and suddenly saw a large bridge over water.';
      expect(() => validateForInterpretation(description)).not.toThrow();
    });
  });

  describe('saveDream', () => {
    beforeEach(() => {
      mockValues.mockReset().mockResolvedValue(undefined);
      mockSelectWhere.mockReset();
    });

    it('inserts the draft and returns the freshly-read row', async () => {
      mockSelectWhere.mockResolvedValue([baseDream]);

      const result = await saveDream({
        id: 'dream-1',
        userId: 'user-1',
        description: baseDream.description,
        occurredAt: baseDream.occurredAt,
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'dream-1',
          syncStatus: 'local',
          isDeleted: false,
          editedSinceInterpretation: false,
        })
      );
      expect(result).toEqual(baseDream);
    });

    it('throws "Failed to save dream" when the row cannot be read back after insert', async () => {
      mockSelectWhere.mockResolvedValue([]);

      await expect(
        saveDream({
          id: 'dream-1',
          userId: 'user-1',
          description: baseDream.description,
          occurredAt: baseDream.occurredAt,
        })
      ).rejects.toThrow('Failed to save dream');
    });
  });

  describe('updateDream', () => {
    beforeEach(() => {
      mockUpdateWhere.mockReset().mockResolvedValue(undefined);
      mockSet.mockClear();
    });

    it('marks editedSinceInterpretation=true when description changes', async () => {
      await updateDream('dream-1', { description: 'A brand new dream description here.' });

      expect(mockUpdateWhere).toHaveBeenCalled();
      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0] as Record<
        string,
        unknown
      >;
      expect(setArg['editedSinceInterpretation']).toBe(true);
      expect(setArg['syncStatus']).toBe('local');
    });

    it('does not set editedSinceInterpretation when only occurredAt changes', async () => {
      await updateDream('dream-1', { occurredAt: '2026-08-02T00:00:00.000Z' });

      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0] as Record<
        string,
        unknown
      >;
      expect(setArg['editedSinceInterpretation']).toBeUndefined();
    });
  });

  describe('deleteDream', () => {
    // The row that survives here is not a soft delete the user can see — every screen
    // filters on is_deleted — it is the outbound queue entry for the permanent deletion.
    // Purging here instead would destroy the only record that the deletion still has to
    // reach Supabase, and an entry deleted offline would return on the next pull.
    it('queues the deletion by setting isDeleted=true, bumping lastModifiedAt, and syncStatus=local', async () => {
      mockUpdateWhere.mockReset().mockResolvedValue(undefined);
      mockSet.mockClear();
      await deleteDream('dream-1');

      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0] as Record<
        string,
        unknown
      >;
      expect(setArg['isDeleted']).toBe(true);
      expect(setArg['syncStatus']).toBe('local');
      expect(typeof setArg['lastModifiedAt']).toBe('string');
      expect(new Date(setArg['lastModifiedAt'] as string).toString()).not.toBe('Invalid Date');
    });
  });

  describe('purgeDreamLocally', () => {
    // Only `removeCachedMedia` is read here; the other members exist to satisfy
    // MediaCacheDeps and would only couple this test to the hydration path.
    const removeCachedMedia = jest.fn<Promise<void>, [string]>();
    const deps: MediaCacheDeps = {
      getSignedUrl: async () => '',
      cacheMedia: async () => '',
      removeCachedMedia,
      isCached: async () => false,
    };

    beforeEach(() => {
      mockRunAsync.mockReset().mockResolvedValue(undefined);
      mockGetAllAsync.mockReset().mockResolvedValue([]);
      mockWithTransactionAsync.mockClear();
      removeCachedMedia.mockReset().mockResolvedValue(undefined);
    });

    // Unlike Postgres, the local schema declares plain foreign keys with
    // PRAGMA foreign_keys = ON and no ON DELETE CASCADE — deleting the dream first
    // raises a constraint failure and the entry survives.
    it('deletes media and interpretations before the dream itself, in one transaction', async () => {
      await purgeDreamLocally('dream-1');

      const statements = mockRunAsync.mock.calls.map(c => String(c[0]));
      expect(statements).toEqual([
        'DELETE FROM media WHERE dream_id = ?',
        'DELETE FROM interpretations WHERE dream_id = ?',
        'DELETE FROM dreams WHERE id = ?',
      ]);
      expect(mockWithTransactionAsync).toHaveBeenCalledTimes(1);
    });

    it('removes the cached image file of every media row it is about to delete', async () => {
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);

      await purgeDreamLocally('dream-1', deps);

      expect(removeCachedMedia).toHaveBeenCalledWith('media-1');
      expect(removeCachedMedia).toHaveBeenCalledWith('media-2');
    });

    // The cached file is derived data under a 200MB LRU cap; the record itself is what
    // FR-032 is actually about, and must not survive because a file was locked.
    it('still purges the records when a cached file cannot be removed', async () => {
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }]);
      removeCachedMedia.mockRejectedValueOnce(new Error('EBUSY'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await purgeDreamLocally('dream-1', deps);

      expect(mockRunAsync).toHaveBeenCalledWith('DELETE FROM dreams WHERE id = ?', 'dream-1');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('skips the cache sweep entirely when no media cache is supplied', async () => {
      await purgeDreamLocally('dream-1');

      expect(mockGetAllAsync).not.toHaveBeenCalled();
    });
  });

  describe('getPendingDreams', () => {
    afterEach(() => {
      mockFromNoWhere = null;
    });

    it('excludes only synced dreams — a deleted-but-unsynced dream is still pending', async () => {
      const rows: Dream[] = [
        { ...baseDream, id: '1', syncStatus: 'local', isDeleted: false },
        { ...baseDream, id: '2', syncStatus: 'synced', isDeleted: false },
        { ...baseDream, id: '3', syncStatus: 'sync_failed', isDeleted: false },
        { ...baseDream, id: '4', syncStatus: 'local', isDeleted: true },
        { ...baseDream, id: '5', syncStatus: 'synced', isDeleted: true },
      ];
      // getPendingDreams calls db.select().from(dreams) with no .where(), so `from` must resolve directly.
      mockFromNoWhere = jest.fn().mockResolvedValue(rows);

      const pending = await getPendingDreams();
      expect(pending.map(d => d.id)).toEqual(['1', '3', '4']);
    });
  });

  describe('markSynced', () => {
    it('sets syncStatus to synced', async () => {
      mockUpdateWhere.mockReset().mockResolvedValue(undefined);
      mockSet.mockClear();
      await markSynced('dream-1');

      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0];
      expect(setArg).toEqual({ syncStatus: 'synced' });
    });
  });

  describe('getDreams', () => {
    it('queries dreams filtered by userId and not deleted', async () => {
      mockSelectWhere.mockReset().mockResolvedValue([baseDream]);
      const result = await getDreams('user-1');
      expect(result).toEqual([baseDream]);
      expect(mockSelectWhere).toHaveBeenCalledTimes(1);
    });
  });
});
