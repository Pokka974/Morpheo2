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

jest.mock('@db/client', () => ({
  db: {
    insert: jest.fn(() => ({ values: (...args: unknown[]) => mockValues(...args) })),
    select: jest.fn(() => ({ from: (...args: unknown[]) => mockFrom(...args) })),
    update: jest.fn(() => ({ set: (...args: unknown[]) => mockSet(...args) })),
  },
}));

import {
  validateForInterpretation,
  saveDream,
  updateDream,
  deleteDream,
  getPendingDreams,
  markSynced,
  getDreams,
} from '@features/dream-log/dreamRepository';
import type { Dream } from '@db/schema';

// SQLite operations are exercised here against a mocked `db` (chainable insert/select/update),
// isolating dreamRepository's own logic from the real expo-sqlite driver.

const baseDream: Dream = {
  id: 'dream-1',
  userId: 'user-1',
  description: 'A long enough dream description for testing purposes.',
  occurredAt: '2026-08-01T00:00:00.000Z',
  loggedAt: '2026-08-01T00:00:00.000Z',
  lastModifiedAt: '2026-08-01T00:00:00.000Z',
  isDeleted: false,
  editedSinceInterpretation: false,
  syncStatus: 'local',
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
      const description = 'I was walking through a forest and suddenly saw a large bridge over water.';
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
        saveDream({ id: 'dream-1', userId: 'user-1', description: baseDream.description, occurredAt: baseDream.occurredAt })
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
      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0] as Record<string, unknown>;
      expect(setArg['editedSinceInterpretation']).toBe(true);
      expect(setArg['syncStatus']).toBe('local');
    });

    it('does not set editedSinceInterpretation when only occurredAt changes', async () => {
      await updateDream('dream-1', { occurredAt: '2026-08-02T00:00:00.000Z' });

      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0] as Record<string, unknown>;
      expect(setArg['editedSinceInterpretation']).toBeUndefined();
    });
  });

  describe('deleteDream', () => {
    it('soft-deletes by setting isDeleted=true and syncStatus=local', async () => {
      mockUpdateWhere.mockReset().mockResolvedValue(undefined);
      mockSet.mockClear();
      await deleteDream('dream-1');

      const setArg = mockSet.mock.calls[mockSet.mock.calls.length - 1]![0];
      expect(setArg).toEqual({ isDeleted: true, syncStatus: 'local' });
    });
  });

  describe('getPendingDreams', () => {
    afterEach(() => {
      mockFromNoWhere = null;
    });

    it('excludes synced and deleted dreams', async () => {
      const rows: Dream[] = [
        { ...baseDream, id: '1', syncStatus: 'local', isDeleted: false },
        { ...baseDream, id: '2', syncStatus: 'synced', isDeleted: false },
        { ...baseDream, id: '3', syncStatus: 'sync_failed', isDeleted: false },
        { ...baseDream, id: '4', syncStatus: 'local', isDeleted: true },
      ];
      // getPendingDreams calls db.select().from(dreams) with no .where(), so `from` must resolve directly.
      mockFromNoWhere = jest.fn().mockResolvedValue(rows);

      const pending = await getPendingDreams();
      expect(pending.map(d => d.id)).toEqual(['1', '3']);
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
