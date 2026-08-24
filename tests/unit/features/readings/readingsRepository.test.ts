const mockGetAllAsync = jest.fn();

jest.mock('@db/client', () => ({
  sqlite: { getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args) },
}));

import { getReadings } from '@features/readings/readingsRepository';

function row(overrides: Partial<{
  id: string;
  description: string;
  occurred_at: string;
  overall_reading: string | null;
  keywords: string | null;
  confidence: string | null;
}>) {
  return {
    id: 'dream-1',
    description: 'A dream long enough to be interpreted, with plenty of detail.',
    occurred_at: '2026-08-01',
    overall_reading: null,
    keywords: null,
    confidence: null,
    ...overrides,
  };
}

describe('getReadings', () => {
  beforeEach(() => mockGetAllAsync.mockReset());

  it('marks a dream with an interpretation as ready, with parsed keywords and derived title', async () => {
    mockGetAllAsync.mockResolvedValue([
      row({
        description: 'I was flying over the ocean. It felt calm.',
        overall_reading: 'A long interpretation of the flight over water.',
        keywords: JSON.stringify(['flight', 'water']),
        confidence: 'high',
      }),
    ]);

    const [entry] = await getReadings('user-1');

    expect(entry).toMatchObject({
      dreamId: 'dream-1',
      title: 'I was flying over the ocean.',
      status: 'ready',
      keywords: ['flight', 'water'],
      confidence: 'high',
    });
    expect(entry!.excerpt).toContain('interpretation of the flight');
  });

  it('marks a dream with no interpretation and a too-short description as "short"', async () => {
    mockGetAllAsync.mockResolvedValue([row({ description: 'Too short' })]);

    const [entry] = await getReadings('user-1');

    expect(entry!.status).toBe('short');
    expect(entry!.excerpt).toBeNull();
  });

  it('marks a dream with no interpretation but a long-enough description as "pending"', async () => {
    mockGetAllAsync.mockResolvedValue([
      row({ description: 'A dream long enough to be interpreted, with plenty of detail.' }),
    ]);

    const [entry] = await getReadings('user-1');

    expect(entry!.status).toBe('pending');
  });

  it('truncates a long interpretation to the excerpt limit with an ellipsis', async () => {
    mockGetAllAsync.mockResolvedValue([
      row({ overall_reading: 'x'.repeat(300), keywords: '[]', confidence: 'medium' }),
    ]);

    const [entry] = await getReadings('user-1');

    expect(entry!.excerpt!.length).toBeLessThan(300);
    expect(entry!.excerpt!.endsWith('…')).toBe(true);
  });

  it('filters by user, excludes deleted dreams, and adds the keyword EXISTS clause only when a keyword is given', async () => {
    mockGetAllAsync.mockResolvedValue([]);

    await getReadings('user-1');
    let [query, params] = mockGetAllAsync.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('d.user_id = ?');
    expect(query).toContain('d.is_deleted = 0');
    expect(query).not.toContain('json_each');
    expect(params).toEqual(['user-1', 50]);

    mockGetAllAsync.mockClear();
    await getReadings('user-1', 'ocean', 10);
    [query, params] = mockGetAllAsync.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('json_each(i.keywords)');
    expect(params).toEqual(['user-1', 'ocean', 10]);
  });
});
