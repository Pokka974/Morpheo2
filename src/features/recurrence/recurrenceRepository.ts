import { sqlite } from '@db/client';

export interface RecurrencePattern {
  id: string;
  userId: string;
  term: string;
  patternType: 'keyword' | 'emotion' | 'cultural_reference';
  occurrenceCount: number;
  dreamIds: string[];
  lastSeenAt: string;
}

type RecurrenceRow = {
  id: string; user_id: string; term: string; pattern_type: string;
  occurrence_count: number; dream_ids: string; last_seen_at: string;
};

function mapRow(r: RecurrenceRow): RecurrencePattern {
  return {
    id: r.id,
    userId: r.user_id,
    term: r.term,
    patternType: r.pattern_type as RecurrencePattern['patternType'],
    occurrenceCount: r.occurrence_count,
    dreamIds: JSON.parse(r.dream_ids ?? '[]'),
    lastSeenAt: r.last_seen_at,
  };
}

export async function getTopRecurrences(
  userId: string,
  type: 'keyword' | 'emotion' | 'cultural_reference',
  limit: number,
  days?: number
): Promise<RecurrencePattern[]> {
  const dateFilter = days
    ? `AND last_seen_at >= datetime('now', '-${days} days')`
    : '';

  const stmt = sqlite.prepareSync(`
    SELECT id, user_id, term, pattern_type, occurrence_count, dream_ids, last_seen_at
    FROM recurrence_patterns
    WHERE user_id = ?
      AND pattern_type = ?
      ${dateFilter}
    ORDER BY occurrence_count DESC
    LIMIT ?
  `);
  const rows = Array.from(stmt.executeSync([userId, type, limit])) as unknown as RecurrenceRow[];
  return rows.map(mapRow);
}

export async function getRecurrencesForDream(dreamId: string): Promise<RecurrencePattern[]> {
  const stmt = sqlite.prepareSync(`
    SELECT id, user_id, term, pattern_type, occurrence_count, dream_ids, last_seen_at
    FROM recurrence_patterns
    WHERE occurrence_count > 1
      AND dream_ids LIKE ?
    ORDER BY occurrence_count DESC
  `);
  const rows = Array.from(stmt.executeSync([`%${dreamId}%`])) as unknown as RecurrenceRow[];
  return rows
    .map(mapRow)
    .filter(p => p.dreamIds.includes(dreamId));
}
