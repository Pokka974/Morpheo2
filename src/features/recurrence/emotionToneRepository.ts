import { sqlite } from '@db/client';

export interface EmotionTonePoint {
  /** ISO timestamp the dream is filed under. */
  occurredAt: string;
  emotions: string[];
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Every dream in the window that carries any emotion, oldest first — the raw
 * material for the Insights emotion curve.
 *
 * The dreamer's own emotions outrank the reading's, the same preference the
 * journal list and the dream detail apply: they had the dream. A dream the
 * dreamer left untagged still counts through its interpretation's emotions, so
 * the curve does not silently drop most of the journal before the tagging habit
 * forms. Dreams with neither are excluded rather than scored neutral, which
 * would flatten the curve toward the middle with data that does not exist.
 */
export async function getEmotionTonePoints(
  userId: string,
  days?: number
): Promise<EmotionTonePoint[]> {
  const dateFilter = days ? `AND d.occurred_at >= date('now', '-${days} days')` : '';

  const rows = await sqlite.getAllAsync<{
    occurred_at: string;
    dream_emotions: string | null;
    interpretation_emotions: string | null;
  }>(
    `SELECT d.occurred_at AS occurred_at,
            d.emotions AS dream_emotions,
            (SELECT i.emotions FROM interpretations i
              WHERE i.dream_id = d.id
              ORDER BY i.created_at DESC LIMIT 1) AS interpretation_emotions
     FROM dreams d
     WHERE d.user_id = ? AND d.is_deleted = 0
       ${dateFilter}
     ORDER BY d.occurred_at ASC`,
    [userId]
  );

  return rows
    .map(r => {
      const own = parseStringArray(r.dream_emotions);
      return {
        occurredAt: r.occurred_at,
        emotions: own.length ? own : parseStringArray(r.interpretation_emotions),
      };
    })
    .filter(p => p.emotions.length > 0);
}
