import type { JournalEntry } from './DreamCard';

/**
 * The journal list, the search results and the filtered results all render the same
 * `DreamCard`, so they all have to select the same shape. A query that selects only
 * `id, description, occurred_at, sync_status` doesn't render a smaller card — it
 * renders a card with a blank image slot, no emotion chips and no lucid marker, which
 * is exactly how searching for a dream used to make its picture disappear.
 *
 * Kept as SQL fragments rather than a query builder because two of the three callers
 * bolt their own `WHERE` (and, in the filter's case, a second `interpretations` join)
 * onto them.
 */
export const JOURNAL_ENTRY_COLUMNS = `
  d.id, d.description, d.occurred_at, d.sync_status,
  m.local_cache_path as thumbnail_uri,
  d.emotions as dream_emotions,
  i.emotions as interpretation_emotions,
  i.id as interpretation_id,
  d.is_lucid, d.tone, d.clarity, d.dream_type
`;

/**
 * The newest complete image and the newest interpretation for each dream. Both join
 * through a scalar subquery on `id` rather than on `dream_id` directly: a dream with
 * two interpretations (or a regenerated image that left an older row behind) would
 * otherwise multiply its own row and appear in the list twice.
 */
export const JOURNAL_ENTRY_JOINS = `
  LEFT JOIN media m ON m.id = (
    SELECT id FROM media
    WHERE dream_id = d.id AND media_type = 'image' AND generation_status = 'complete'
    ORDER BY created_at DESC
    LIMIT 1
  )
  LEFT JOIN interpretations i ON i.id = (
    SELECT id FROM interpretations
    WHERE dream_id = d.id
    ORDER BY created_at DESC
    LIMIT 1
  )
`;

/**
 * Every journal query is scoped to one account. Local SQLite is shared by every user
 * who has signed in on this device and is deliberately not wiped on sign-out (an
 * offline dream that hasn't pushed yet would go with it), so `is_deleted = 0` alone
 * showed a freshly created account the previous account's entire journal until a sync
 * cycle happened to clear it.
 *
 * The binding for the `?` is the user id, and it comes first in every caller's
 * parameter list.
 */
export const JOURNAL_ENTRY_SCOPE = `d.user_id = ? AND d.is_deleted = 0`;

/**
 * occurred_at is date-only ('2026-08-26'), so every dream logged on the same night
 * sorts equal and SQLite is free to return them in any order. logged_at is a full
 * timestamp and breaks the tie, which is what makes "most recent first" actually true
 * within a day.
 */
export const JOURNAL_ENTRY_ORDER = `ORDER BY d.occurred_at DESC, d.logged_at DESC`;

export interface JournalEntryRow {
  id: string;
  description: string;
  occurred_at: string;
  sync_status: string;
  thumbnail_uri: string | null;
  dream_emotions: string | null;
  interpretation_emotions: string | null;
  interpretation_id: string | null;
  is_lucid: number;
  tone: string | null;
  clarity: number | null;
  dream_type: string | null;
}

export function mapJournalEntryRow(row: JournalEntryRow): JournalEntry {
  return {
    id: row.id,
    description: row.description,
    occurredAt: row.occurred_at,
    syncStatus: row.sync_status as JournalEntry['syncStatus'],
    thumbnailUri: row.thumbnail_uri,
    // What the dreamer said they felt outranks what the AI read: they were there.
    // The interpretation's emotions stand in only until the dream has its own —
    // which is every dream logged before the log screen collected them.
    emotions: pickEmotions(row.dream_emotions, row.interpretation_emotions),
    hasInterpretation: Boolean(row.interpretation_id),
    isLucid: Boolean(row.is_lucid),
    tone: row.tone as JournalEntry['tone'],
    clarity: row.clarity,
    dreamType: parseStringArray(row.dream_type),
  };
}

/** The dreamer's own emotions where there are any, the AI's reading otherwise. */
export function pickEmotions(
  dreamEmotions: string | null,
  interpretationEmotions: string | null
): string[] {
  const own = parseStringArray(dreamEmotions);
  return own.length > 0 ? own : parseStringArray(interpretationEmotions);
}

export function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Emotions and type tags are written by the interpretation Edge Function and by
    // the log screen; a malformed row should degrade to "no chips", never crash the
    // journal.
    return [];
  }
}
