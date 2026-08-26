import { sqlite } from '@db/client';
import { generateId } from '@shared/id';

export type PatternType = 'keyword' | 'emotion' | 'cultural_reference' | 'theme';

export interface RecurrencePattern {
  id: string;
  userId: string;
  term: string;
  patternType: PatternType;
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
  type: PatternType,
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

export interface MonthlyThemeRecurrence {
  theme: string;
  /** This dream's 1-based position within the calendar month, chronologically. */
  ordinal: number;
  totalThisMonth: number;
  /** Oldest → newest, for row rendering. */
  dreamsThisMonth: Array<{ id: string; title: string; occurredAt: string }>;
}

/** First sentence, or a clipped opening — mirrors DreamCard's `deriveTitle` and
 * recurrenceChains' own copy, kept local so this repository has no UI import. */
function deriveTitle(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return firstSentence.length > 48 ? `${firstSentence.slice(0, 45).trimEnd()}…` : firstSentence;
}

/**
 * The AI-detected recurring theme behind the dream detail screen's "Nth {theme} dream
 * this month" section — distinct from `getRecurrenceChains`' manually-linked chains.
 * Picks the dream's highest lifetime-occurrence-count theme pattern (already how
 * `getRecurrencesForDream` sorts), then narrows it to dreams sharing that theme within
 * the same calendar month as `occurredAt`. Returns null when this dream isn't at least
 * the month's 2nd occurrence — "1st X dream this month" isn't a recurrence signal.
 */
export async function getMonthlyThemeForDream(
  dreamId: string,
  occurredAt: string
): Promise<MonthlyThemeRecurrence | null> {
  const patterns = await getRecurrencesForDream(dreamId);
  const themePattern = patterns.find(p => p.patternType === 'theme');
  if (!themePattern) return null;

  const placeholders = themePattern.dreamIds.map(() => '?').join(',');
  const rows = await sqlite.getAllAsync<{ id: string; description: string; occurred_at: string }>(
    `SELECT id, description, occurred_at FROM dreams WHERE id IN (${placeholders}) AND is_deleted = 0`,
    themePattern.dreamIds
  );

  const target = new Date(occurredAt);
  const sameMonth = rows
    .filter(r => {
      const d = new Date(r.occurred_at);
      return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
    })
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const ordinal = sameMonth.findIndex(r => r.id === dreamId) + 1;
  if (ordinal < 2) return null;

  return {
    theme: themePattern.term,
    ordinal,
    totalThisMonth: sameMonth.length,
    dreamsThisMonth: sameMonth.map(r => ({
      id: r.id,
      title: deriveTitle(r.description),
      occurredAt: r.occurred_at,
    })),
  };
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
  patternType: 'keyword' | 'emotion' | 'theme',
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
