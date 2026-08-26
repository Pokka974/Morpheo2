const mockGetAllAsync = jest.fn();

jest.mock('@db/client', () => ({
  sqlite: { getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args) },
}));

import { getRecurrenceChains } from '@features/recurrence/recurrenceChains';

function dream(
  id: string,
  description: string,
  occurredAt: string,
  linkedDreamId: string | null = null
) {
  return { id, description, occurred_at: occurredAt, linked_dream_id: linkedDreamId };
}

describe('getRecurrenceChains', () => {
  beforeEach(() => mockGetAllAsync.mockReset());

  it('returns nothing when no dream links to another', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('a', 'A standalone dream.', '2026-08-01'),
      dream('b', 'Another standalone dream.', '2026-08-02'),
    ]);

    expect(await getRecurrenceChains('user-1')).toEqual([]);
  });

  it('groups a linked pair into one chain, oldest dream first', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('later', 'The continuation of an earlier dream.', '2026-08-05', 'earlier'),
      dream('earlier', 'The first dream in the thread.', '2026-08-01'),
    ]);

    const chains = await getRecurrenceChains('user-1');

    expect(chains).toHaveLength(1);
    expect(chains[0]!.dreams.map(d => d.id)).toEqual(['earlier', 'later']);
  });

  it('chains three dreams linked in sequence into a single group', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('third', 'Third in the thread.', '2026-08-10', 'second'),
      dream('second', 'Second in the thread.', '2026-08-05', 'first'),
      dream('first', 'First in the thread.', '2026-08-01'),
    ]);

    const chains = await getRecurrenceChains('user-1');

    expect(chains).toHaveLength(1);
    expect(chains[0]!.dreams.map(d => d.id)).toEqual(['first', 'second', 'third']);
  });

  it('keeps unrelated chains separate', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('a2', 'Continues chain A.', '2026-08-03', 'a1'),
      dream('a1', 'Starts chain A.', '2026-08-01'),
      dream('b2', 'Continues chain B.', '2026-08-09', 'b1'),
      dream('b1', 'Starts chain B.', '2026-08-07'),
    ]);

    const chains = await getRecurrenceChains('user-1');

    expect(chains).toHaveLength(2);
  });

  it('ignores a linked_dream_id that points at a dream outside this result set (deleted or another user)', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('orphan', 'Links to a dream that is not in this list.', '2026-08-05', 'missing'),
    ]);

    expect(await getRecurrenceChains('user-1')).toEqual([]);
  });

  it('sorts chains by their most recent dream, newest first', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('old-b', 'Older chain, second dream.', '2026-08-04', 'old-a'),
      dream('old-a', 'Older chain, first dream.', '2026-08-01'),
      dream('new-b', 'Newer chain, second dream.', '2026-08-20', 'new-a'),
      dream('new-a', 'Newer chain, first dream.', '2026-08-15'),
    ]);

    const chains = await getRecurrenceChains('user-1');

    expect(chains.map(c => c.id)).toEqual(['new-a', 'old-a']);
  });

  it('derives each dream title from its first sentence', async () => {
    mockGetAllAsync.mockResolvedValue([
      dream('later', 'I was flying again. It felt different this time.', '2026-08-05', 'earlier'),
      dream('earlier', 'A short first dream.', '2026-08-01'),
    ]);

    const chains = await getRecurrenceChains('user-1');

    expect(chains[0]!.dreams[1]!.title).toBe('I was flying again.');
  });
});
