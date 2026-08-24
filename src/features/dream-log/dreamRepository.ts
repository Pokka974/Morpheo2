import { eq, and } from 'drizzle-orm';
import { db, sqlite } from '@db/client';
import { dreams } from '@db/schema';
import type { Dream, NewDream } from '@db/schema';

const MIN_DESCRIPTION_LENGTH_FOR_INTERPRETATION = 20;

export function validateForInterpretation(description: string): void {
  if (description.trim().length < MIN_DESCRIPTION_LENGTH_FOR_INTERPRETATION) {
    throw new Error(
      `Dream description must be at least ${MIN_DESCRIPTION_LENGTH_FOR_INTERPRETATION} characters for interpretation.`
    );
  }
}

export async function saveDream(
  draft: Omit<
    NewDream,
    'syncStatus' | 'loggedAt' | 'lastModifiedAt' | 'isDeleted' | 'editedSinceInterpretation'
  >
): Promise<Dream> {
  const now = new Date().toISOString();
  const newDream: NewDream = {
    ...draft,
    syncStatus: 'local',
    loggedAt: now,
    lastModifiedAt: now,
    isDeleted: false,
    editedSinceInterpretation: false,
  };
  await db.insert(dreams).values(newDream);
  const inserted = await db.select().from(dreams).where(eq(dreams.id, draft.id));
  const result = inserted[0];
  if (!result) throw new Error('Failed to save dream');
  return result;
}

export async function updateDream(
  id: string,
  changes: Partial<Pick<Dream, 'description' | 'occurredAt'>>
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(dreams)
    .set({
      ...changes,
      lastModifiedAt: now,
      ...(changes.description !== undefined ? { editedSinceInterpretation: true } : {}),
      syncStatus: 'local',
    })
    .where(eq(dreams.id, id));
}

export async function deleteDream(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(dreams)
    .set({ isDeleted: true, lastModifiedAt: now, syncStatus: 'local' })
    .where(eq(dreams.id, id));
}

export async function getPendingDreams(): Promise<Dream[]> {
  const allDreams = await db.select().from(dreams);
  return allDreams.filter(d => d.syncStatus !== 'synced');
}

export async function markSynced(id: string): Promise<void> {
  await db.update(dreams).set({ syncStatus: 'synced' }).where(eq(dreams.id, id));
}

export async function getDreams(userId: string): Promise<Dream[]> {
  return db
    .select()
    .from(dreams)
    .where(and(eq(dreams.userId, userId), eq(dreams.isDeleted, false)));
}

export interface LinkableDream {
  id: string;
  title: string;
  occurredAt: string;
}

/**
 * Candidates for "Déjà rêvé de ça" — recent dreams the current one could continue.
 * Excludes the dream being logged (relevant only when editing) and anything already
 * soft-deleted. Titles are derived the same way the journal list derives them, since
 * dreams have no dedicated title field.
 */
export async function getRecentDreamsForLinking(
  userId: string,
  excludeId: string | null,
  limit = 20
): Promise<LinkableDream[]> {
  const rows = await sqlite.getAllAsync<{ id: string; description: string; occurred_at: string }>(
    `SELECT id, description, occurred_at FROM dreams
     WHERE user_id = ? AND is_deleted = 0 AND id != ?
     ORDER BY occurred_at DESC
     LIMIT ?`,
    [userId, excludeId ?? '', limit]
  );
  return rows.map(r => ({
    id: r.id,
    title: deriveShortTitle(r.description),
    occurredAt: r.occurred_at,
  }));
}

/** First sentence, or a clipped opening — mirrors DreamCard's `deriveTitle`, kept
 * local so this repository does not import a UI component. */
function deriveShortTitle(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return firstSentence.length > 48 ? `${firstSentence.slice(0, 45).trimEnd()}…` : firstSentence;
}

/**
 * Distinct values previously entered for `characters` or `places`, most recent
 * first — the design's "reused across dreams" suggestion list for the tag inputs.
 */
export async function getTagSuggestions(
  userId: string,
  field: 'characters' | 'places',
  limit = 12
): Promise<string[]> {
  const rows = await sqlite.getAllAsync<{ tag: string; last_used: string }>(
    `SELECT je.value AS tag, MAX(d.occurred_at) AS last_used
     FROM dreams d, json_each(d.${field}) je
     WHERE d.user_id = ? AND d.is_deleted = 0 AND TRIM(je.value) != ''
     GROUP BY je.value
     ORDER BY last_used DESC
     LIMIT ?`,
    [userId, limit]
  );
  return rows.map(r => r.tag);
}
