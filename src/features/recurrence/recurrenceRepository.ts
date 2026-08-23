import { sqlite } from '@db/client';
import { generateId } from '@shared/id';

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
  id: string;
  user_id: string;
  term: string;
  pattern_type: string;
  occurrence_count: number;
  dream_ids: string;
  last_seen_at: string;
};

function mapRow(r: RecurrenceRow): RecurrencePattern {
  return {
    id: r.id,
    userId: r.user_id,
    term: r.term,
    patternType: r.pattern_type as RecurrencePattern['patternType'],
    occurrenceCount: r.occurrence_count,
    dreamIds: JSON.parse(r.dream_ids ?? '[]') as string[],
    lastSeenAt: r.last_seen_at,
  };
}

export function getTopRecurrences(
  userId: string,
  type: 'keyword' | 'emotion' | 'cultural_reference',
  limit: number,
  days?: number
): Promise<RecurrencePattern[]> {
  const dateFilter = days ? `AND last_seen_at >= datetime('now', '-${days} days')` : '';

  const stmt = sqlite.prepareSync(`
    SELECT id, user_id, symbol AS term, pattern_type, occurrence_count, dream_ids, last_seen_at
    FROM recurrence_patterns
    WHERE user_id = ?
      AND pattern_type = ?
      ${dateFilter}
    ORDER BY occurrence_count DESC
    LIMIT ?
  `);
  const rows = Array.from(stmt.executeSync([userId, type, limit])) as unknown as RecurrenceRow[];
  return Promise.resolve(rows.map(mapRow));
}

export function getRecurrencesForDream(dreamId: string): Promise<RecurrencePattern[]> {
  const stmt = sqlite.prepareSync(`
    SELECT id, user_id, symbol AS term, pattern_type, occurrence_count, dream_ids, last_seen_at
    FROM recurrence_patterns
    WHERE occurrence_count > 1
      AND dream_ids LIKE ?
    ORDER BY occurrence_count DESC
  `);
  const rows = Array.from(stmt.executeSync([`%${dreamId}%`])) as unknown as RecurrenceRow[];
  return Promise.resolve(rows.map(mapRow).filter(p => p.dreamIds.includes(dreamId)));
}

/**
 * Records that `terms` (keywords or emotions) appeared in `dreamId`'s interpretation,
 * upserting into recurrence_patterns per term. Idempotent per (term, dreamId) pair —
 * re-interpreting the same dream doesn't inflate occurrence_count a second time.
 */
export function recordRecurrence(
  userId: string,
  dreamId: string,
  patternType: 'keyword' | 'emotion',
  terms: string[],
  seenAt: string = new Date().toISOString()
): Promise<void> {
  for (const rawTerm of terms) {
    const term = rawTerm.trim().toLowerCase();
    if (!term) continue;

    const selectStmt = sqlite.prepareSync(`
      SELECT id, occurrence_count, dream_ids
      FROM recurrence_patterns
      WHERE user_id = ? AND symbol = ? AND pattern_type = ?
    `);
    const existing = Array.from(selectStmt.executeSync([userId, term, patternType])) as unknown as {
      id: string;
      occurrence_count: number;
      dream_ids: string;
    }[];

    if (existing.length > 0) {
      const row = existing[0]!;
      const dreamIds = JSON.parse(row.dream_ids || '[]') as string[];
      if (dreamIds.includes(dreamId)) {
        const touchStmt = sqlite.prepareSync(
          `UPDATE recurrence_patterns SET last_seen_at = ?, updated_at = datetime('now') WHERE id = ?`
        );
        touchStmt.executeSync([seenAt, row.id]);
        continue;
      }
      dreamIds.push(dreamId);
      const updateStmt = sqlite.prepareSync(`
        UPDATE recurrence_patterns
        SET occurrence_count = ?, dream_ids = ?, last_seen_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      updateStmt.executeSync([row.occurrence_count + 1, JSON.stringify(dreamIds), seenAt, row.id]);
    } else {
      const insertStmt = sqlite.prepareSync(`
        INSERT INTO recurrence_patterns
          (id, user_id, symbol, pattern_type, occurrence_count, dream_ids, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `);
      insertStmt.executeSync([
        generateId(),
        userId,
        term,
        patternType,
        JSON.stringify([dreamId]),
        seenAt,
        seenAt,
      ]);
    }
  }
  return Promise.resolve();
}
