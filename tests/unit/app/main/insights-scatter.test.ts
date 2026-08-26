// Mocked before import: insights/index.tsx imports the real Supabase client at
// module scope, which throws on missing env vars outside a mocked test context —
// same reason insights-index.test.tsx mocks it.
jest.mock('@services/../supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

import { buildScatterData } from '@app/(main)/insights/index';
import type { SleepClarityPoint } from '@features/recurrence/sleepClarityRepository';

function points(pairs: Array<[number, number]>): SleepClarityPoint[] {
  return pairs.map(([sleepQuality, clarity]) => ({ sleepQuality, clarity }));
}

describe('buildScatterData', () => {
  it('returns no bubbles or trend below the minimum point count', () => {
    const result = buildScatterData(points([[3, 3], [4, 4]]));
    expect(result).toEqual({ bubbles: [], trend: null, captionQuality: null });
  });

  it('aggregates repeated (quality, clarity) pairs into one bubble with a count', () => {
    const result = buildScatterData(
      points([
        [4, 5],
        [4, 5],
        [2, 2],
        [3, 3],
        [5, 5],
      ])
    );

    const bubble = result.bubbles.find(b => b.x === 4 && b.y === 5);
    expect(bubble?.count).toBe(2);
    expect(result.bubbles).toHaveLength(4);
  });

  it('names a caption threshold when sleep quality and clarity rise together', () => {
    // A clean positive relationship: clarity == sleep quality for every point.
    const result = buildScatterData(points([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]));

    expect(result.trend).not.toBeNull();
    expect(result.trend!.y2).toBeGreaterThan(result.trend!.y1);
    expect(result.captionQuality).not.toBeNull();
  });

  it('names no caption threshold when there is no positive relationship', () => {
    // Clarity is constant regardless of sleep quality — flat slope.
    const result = buildScatterData(points([[1, 3], [2, 3], [3, 3], [4, 3], [5, 3]]));

    expect(result.captionQuality).toBeNull();
  });

  it('names no caption threshold when clarity falls as sleep quality rises', () => {
    const result = buildScatterData(points([[1, 5], [2, 4], [3, 3], [4, 2], [5, 1]]));

    expect(result.captionQuality).toBeNull();
  });

  it('picks the lowest quality bucket within 0.5 of the best mean clarity, not just the single best bucket', () => {
    // Buckets 4 and 5 both average close to the top (5 and 4.5) while bucket 1-3 lag
    // behind — the plateau starts at 4, so the caption should name 4, not 5.
    const result = buildScatterData(
      points([
        [1, 1],
        [2, 1],
        [3, 2],
        [4, 5],
        [4, 4],
        [5, 5],
        [5, 4],
      ])
    );

    expect(result.captionQuality).toBe(4);
  });
});
