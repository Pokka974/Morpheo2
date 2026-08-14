import { eq, and } from 'drizzle-orm';
import { db } from '@db/client';
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

export async function saveDream(draft: Omit<NewDream, 'syncStatus' | 'loggedAt' | 'lastModifiedAt' | 'isDeleted' | 'editedSinceInterpretation'>): Promise<Dream> {
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

export async function updateDream(id: string, changes: Partial<Pick<Dream, 'description' | 'occurredAt'>>): Promise<void> {
  const now = new Date().toISOString();
  await db.update(dreams).set({
    ...changes,
    lastModifiedAt: now,
    ...(changes.description !== undefined ? { editedSinceInterpretation: true } : {}),
    syncStatus: 'local',
  }).where(eq(dreams.id, id));
}

export async function deleteDream(id: string): Promise<void> {
  await db.update(dreams).set({ isDeleted: true, syncStatus: 'local' }).where(eq(dreams.id, id));
}

export async function getPendingDreams(): Promise<Dream[]> {
  const allDreams = await db.select().from(dreams);
  return allDreams.filter(d => d.syncStatus !== 'synced' && !d.isDeleted);
}

export async function markSynced(id: string): Promise<void> {
  await db.update(dreams).set({ syncStatus: 'synced' }).where(eq(dreams.id, id));
}

export async function getDreams(userId: string): Promise<Dream[]> {
  return db.select().from(dreams).where(
    and(eq(dreams.userId, userId), eq(dreams.isDeleted, false))
  );
}
