// Mocked before import: insights/index.tsx imports the real Supabase client at
// module scope, which throws on missing env vars outside a mocked test context.
jest.mock('@services/../supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

import { buildRibbon } from '@app/(main)/insights/index';
import type { EmotionTonePoint } from '@features/recurrence/emotionToneRepository';

/** Day `n` of January 2026, so a bucket index is easy to reason about. */
function day(n: number, ...emotions: string[]): EmotionTonePoint {
  return { occurredAt: `2026-01-${String(n).padStart(2, '0')}T08:00:00.000Z`, emotions };
}

describe('buildRibbon', () => {
  it('draws nothing below the minimum tagged-dream count', () => {
    expect(buildRibbon([day(1, 'joy'), day(2, 'fear'), day(3, 'calm')], 'en')).toEqual([]);
  });

  it('draws nothing when every dream falls on the same day — there is no "over time"', () => {
    const sameDay = [day(1, 'joy'), day(1, 'fear'), day(1, 'calm'), day(1, 'anger')];
    expect(buildRibbon(sameDay, 'en')).toEqual([]);
  });

  it('reports the share of dreams that felt good and the share that felt tense', () => {
    // Two buckets: the first month-half all positive, the second all tense.
    const result = buildRibbon(
      [day(1, 'joy'), day(2, 'calm'), day(29, 'fear'), day(30, 'anxiety'), day(31, 'anger')],
      'en'
    );

    expect(result[0]!.positive).toBe(1);
    expect(result[0]!.tension).toBe(0);
    expect(result[result.length - 1]!.positive).toBe(0);
    expect(result[result.length - 1]!.tension).toBe(1);
  });

  it('treats the two curves as independent, not as complements', () => {
    // A dream can be both free and afraid. A positive-minus-negative score would
    // erase that; these are two separate shares and may both be 1.
    const both = [
      day(1, 'freedom', 'fear'),
      day(2, 'freedom', 'fear'),
      day(20, 'joy'),
      day(30, 'anger'),
    ];
    const result = buildRibbon(both, 'en');

    expect(result[0]!.positive).toBe(1);
    expect(result[0]!.tension).toBe(1);
  });

  it('ignores emotions in neither vocabulary rather than scoring them', () => {
    const result = buildRibbon(
      [
        day(1, 'a-feeling-the-model-invented'),
        day(2, 'another-one'),
        day(28, 'joy'),
        day(31, 'joy'),
      ],
      'en'
    );

    expect(result[0]!.positive).toBe(0);
    expect(result[0]!.tension).toBe(0);
  });

  it('spans the full period, first dream to last', () => {
    const result = buildRibbon(
      [day(1, 'joy'), day(10, 'fear'), day(20, 'calm'), day(31, 'anger')],
      'en'
    );

    expect(result[0]!.t).toBe(0);
    expect(result[result.length - 1]!.t).toBe(1);
  });

  it('drops stretches with no dreams instead of drawing the curve to zero', () => {
    // Nothing logged in the middle of the month: a gap in the record is not a
    // month of joyless nights.
    const result = buildRibbon(
      [day(1, 'joy'), day(2, 'joy'), day(30, 'calm'), day(31, 'calm')],
      'en'
    );

    expect(result).toHaveLength(2);
    expect(result.every(p => p.positive === 1)).toBe(true);
  });

  it('labels only the ends and the middle, so dates do not collide', () => {
    const spread = [1, 6, 12, 18, 24, 31].map(n => day(n, 'joy'));
    const result = buildRibbon(spread, 'en');

    const labelled = result.filter(p => p.label);
    expect(labelled).toHaveLength(3);
    expect(result[0]!.label).toBeDefined();
    expect(result[result.length - 1]!.label).toBeDefined();
  });

  /**
   * Over a short span the six bucket midpoints are only hours apart, so the ends and
   * the middle can all format to the same calendar day. Two identical labels on one
   * axis say nothing, and `EmotionRibbon` used to key on the label text — so the
   * duplicate also cost one of them its React key.
   */
  it('never labels two buckets with the same date', () => {
    // Four dreams inside a single 25 August: a span of hours, not weeks.
    const oneDay = ['06:00', '09:00', '15:00', '23:00'].map(time => ({
      occurredAt: `2026-08-25T${time}:00.000Z`,
      emotions: ['joy'],
    }));

    const labels = buildRibbon(oneDay, 'fr')
      .map(p => p.label)
      .filter((l): l is string => Boolean(l));

    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('formats its date labels in the caller’s locale', () => {
    const spread = [1, 10, 20, 31].map(n => day(n, 'joy'));

    expect(buildRibbon(spread, 'en')[0]!.label).toMatch(/Jan/);
    expect(buildRibbon(spread, 'fr')[0]!.label).toMatch(/janv/);
  });
});
