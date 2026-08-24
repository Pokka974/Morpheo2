import { sqlite } from '@db/client';

export interface SleepClarityPoint {
  sleepQuality: number;
  clarity: number;
}

/**
 * Every dream with both `sleep_quality` and `clarity` set, within the window —
 * the raw material for the Insights "what changes your nights" chart. Dreams
 * missing either field (most of the journal, until the habit forms) are excluded
 * rather than treated as zero, which would drag the chart toward the corner.
 */
export async function getSleepClarityPoints(
  userId: string,
  days?: number
): Promise<SleepClarityPoint[]> {
  const dateFilter = days ? `AND occurred_at >= date('now', '-${days} days')` : '';

  const rows = await sqlite.getAllAsync<{ sleep_quality: number; clarity: number }>(
    `SELECT sleep_quality, clarity FROM dreams
     WHERE user_id = ? AND is_deleted = 0
       AND sleep_quality IS NOT NULL AND clarity IS NOT NULL
       ${dateFilter}`,
    [userId]
  );
  return rows.map(r => ({ sleepQuality: r.sleep_quality, clarity: r.clarity }));
}
