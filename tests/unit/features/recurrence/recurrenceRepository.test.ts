import { getTopRecurrences, getRecurrencesForDream } from '@features/recurrence/recurrenceRepository';

const mockExecuteSync = jest.fn();
const mockPrepareSync = jest.fn().mockReturnValue({ executeSync: mockExecuteSync });

jest.mock('@db/client', () => ({
  sqlite: { prepareSync: (...args: unknown[]) => mockPrepareSync(...args) },
}));

const waterPattern = {
  id: 'rp-1', user_id: 'user-001', term: 'water', pattern_type: 'keyword',
  occurrence_count: 4, dream_ids: JSON.stringify(['d1', 'd2', 'd3', 'd4']), last_seen_at: '2026-08-14',
};
const firePattern = {
  id: 'rp-2', user_id: 'user-001', term: 'fire', pattern_type: 'keyword',
  occurrence_count: 2, dream_ids: JSON.stringify(['d1', 'd5']), last_seen_at: '2026-08-12',
};
const fearEmotion = {
  id: 'rp-3', user_id: 'user-001', term: 'fear', pattern_type: 'emotion',
  occurrence_count: 3, dream_ids: JSON.stringify(['d1', 'd3', 'd4']), last_seen_at: '2026-08-14',
};

describe('recurrenceRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getTopRecurrences', () => {
    it('returns patterns ordered by occurrence_count DESC', async () => {
      mockExecuteSync.mockReturnValue([waterPattern, firePattern]);
      const result = await getTopRecurrences('user-001', 'keyword', 10);
      expect(result[0].term).toBe('water');
      expect(result[0].occurrenceCount).toBe(4);
    });

    it('includes days parameter when specified', async () => {
      mockExecuteSync.mockReturnValue([waterPattern]);
      await getTopRecurrences('user-001', 'keyword', 3, 30);
      const query = mockPrepareSync.mock.calls[0][0] as string;
      expect(query).toContain('-30 days');
    });

    it('omits date filter when days is undefined', async () => {
      mockExecuteSync.mockReturnValue([waterPattern]);
      await getTopRecurrences('user-001', 'keyword', 10);
      const query = mockPrepareSync.mock.calls[0][0] as string;
      expect(query).not.toContain('days');
    });

    it('queries emotion type correctly', async () => {
      mockExecuteSync.mockReturnValue([fearEmotion]);
      const result = await getTopRecurrences('user-001', 'emotion', 3, 30);
      expect(result[0].patternType).toBe('emotion');
    });

    it('parses dreamIds from JSON string', async () => {
      mockExecuteSync.mockReturnValue([waterPattern]);
      const result = await getTopRecurrences('user-001', 'keyword', 10);
      expect(result[0].dreamIds).toEqual(['d1', 'd2', 'd3', 'd4']);
    });
  });

  describe('getRecurrencesForDream', () => {
    it('returns only patterns that include the dreamId', async () => {
      mockExecuteSync.mockReturnValue([waterPattern, fearEmotion]);
      const result = await getRecurrencesForDream('d1');
      expect(result.every(p => p.dreamIds.includes('d1'))).toBe(true);
    });

    it('filters out patterns that do not include the dreamId', async () => {
      mockExecuteSync.mockReturnValue([waterPattern, firePattern]);
      const result = await getRecurrencesForDream('d2');
      const terms = result.map(p => p.term);
      expect(terms).toContain('water');
      expect(terms).not.toContain('fire');
    });

    it('uses LIKE query with dreamId for filtering', async () => {
      mockExecuteSync.mockReturnValue([]);
      await getRecurrencesForDream('d99');
      const query = mockPrepareSync.mock.calls[0][0] as string;
      expect(query).toContain('occurrence_count > 1');
      expect(query).toContain('dream_ids LIKE ?');
    });
  });
});
