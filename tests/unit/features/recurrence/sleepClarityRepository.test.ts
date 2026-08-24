const mockGetAllAsync = jest.fn();

jest.mock('@db/client', () => ({
  sqlite: { getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args) },
}));

import { getSleepClarityPoints } from '@features/recurrence/sleepClarityRepository';

describe('getSleepClarityPoints', () => {
  beforeEach(() => mockGetAllAsync.mockReset());

  it('maps snake_case rows to camelCase points', async () => {
    mockGetAllAsync.mockResolvedValue([
      { sleep_quality: 4, clarity: 5 },
      { sleep_quality: 2, clarity: 3 },
    ]);

    const result = await getSleepClarityPoints('user-1');

    expect(result).toEqual([
      { sleepQuality: 4, clarity: 5 },
      { sleepQuality: 2, clarity: 3 },
    ]);
  });

  it('filters to the requesting user, excludes deleted dreams, and requires both fields set', async () => {
    mockGetAllAsync.mockResolvedValue([]);

    await getSleepClarityPoints('user-1');

    const [query, params] = mockGetAllAsync.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('user_id = ?');
    expect(query).toContain('is_deleted = 0');
    expect(query).toContain('sleep_quality IS NOT NULL AND clarity IS NOT NULL');
    expect(params).toEqual(['user-1']);
  });

  it('adds a days window when requested, and omits it for an all-time query', async () => {
    mockGetAllAsync.mockResolvedValue([]);

    await getSleepClarityPoints('user-1', 30);
    expect((mockGetAllAsync.mock.calls[0]![0] as string)).toContain('-30 days');

    mockGetAllAsync.mockClear();
    await getSleepClarityPoints('user-1');
    expect((mockGetAllAsync.mock.calls[0]![0] as string)).not.toContain('days');
  });
});
