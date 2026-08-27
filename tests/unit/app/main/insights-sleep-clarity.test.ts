// Mocked before import: insights/index.tsx imports the real Supabase client at
// module scope, which throws on missing env vars outside a mocked test context —
// same reason insights-index.test.tsx mocks it.
jest.mock('@services/../supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

import { buildSleepClarityData } from '@app/(main)/insights/index';
import type { SleepClarityPoint } from '@features/recurrence/sleepClarityRepository';

function points(pairs: Array<[number, number]>): SleepClarityPoint[] {
  return pairs.map(([sleepQuality, clarity]) => ({ sleepQuality, clarity }));
}

describe('buildSleepClarityData', () => {
  it('returns no bars below the minimum night count', () => {
    const result = buildSleepClarityData(
      points([
        [3, 3],
        [4, 4],
      ])
    );
    expect(result).toEqual({ bars: [], captionQuality: null });
  });

  it('averages clarity per sleep rating and reports how many nights back each bar', () => {
    const result = buildSleepClarityData(
      points([
        [4, 5],
        [4, 3],
        [2, 2],
        [3, 3],
        [5, 5],
      ])
    );

    const four = result.bars.find(b => b.quality === 4);
    expect(four).toEqual({ quality: 4, meanClarity: 4, count: 2 });
    // One bar per distinct rating, never one per night.
    expect(result.bars).toHaveLength(4);
  });

  it('returns bars in ascending sleep-quality order, so the x axis reads left to right', () => {
    const result = buildSleepClarityData(
      points([
        [5, 5],
        [1, 1],
        [3, 3],
        [2, 2],
        [4, 4],
      ])
    );

    expect(result.bars.map(b => b.quality)).toEqual([1, 2, 3, 4, 5]);
  });

  it('names a caption threshold when sleep quality and clarity rise together', () => {
    const result = buildSleepClarityData(
      points([
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ])
    );

    expect(result.captionQuality).not.toBeNull();
  });

  it('names no caption threshold when there is no positive relationship', () => {
    // Clarity is constant regardless of sleep quality — flat slope.
    const result = buildSleepClarityData(
      points([
        [1, 3],
        [2, 3],
        [3, 3],
        [4, 3],
        [5, 3],
      ])
    );

    expect(result.captionQuality).toBeNull();
  });

  it('names no caption threshold when clarity falls as sleep quality rises', () => {
    const result = buildSleepClarityData(
      points([
        [1, 5],
        [2, 4],
        [3, 3],
        [4, 2],
        [5, 1],
      ])
    );

    expect(result.captionQuality).toBeNull();
  });

  it('picks the lowest quality bucket within 0.5 of the best mean clarity, not just the single best bucket', () => {
    // Buckets 4 and 5 both average close to the top (4.5 and 4.5) while 1-3 lag
    // behind — the plateau starts at 4, so the caption should name 4, not 5.
    const result = buildSleepClarityData(
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

  it('still returns bars when the relationship is flat — only the claim is withheld', () => {
    const result = buildSleepClarityData(
      points([
        [1, 3],
        [2, 3],
        [3, 3],
        [4, 3],
        [5, 3],
      ])
    );

    expect(result.bars).toHaveLength(5);
    expect(result.captionQuality).toBeNull();
  });
});
