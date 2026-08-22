import { supabase } from '../../supabase/client';
import { getPendingDreams, markSynced } from './dreamRepository';
import type { Dream } from '@db/schema';

export async function syncPendingDreams(): Promise<void> {
  const pending = await getPendingDreams();
  if (pending.length === 0) return;

  const sorted = [...pending].sort(
    (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
  );

  for (const dream of sorted) {
    await syncDream(dream);
  }
}

async function syncDream(dream: Dream): Promise<void> {
  try {
    const { error } = await supabase.from('dreams').upsert(
      {
        id: dream.id,
        user_id: dream.userId,
        description: dream.description,
        occurred_at: dream.occurredAt,
        logged_at: dream.loggedAt,
        last_modified_at: dream.lastModifiedAt,
        is_deleted: dream.isDeleted,
        edited_since_interpretation: dream.editedSinceInterpretation,
      },
      {
        onConflict: 'id',
        ignoreDuplicates: false,
      }
    );

    if (error) {
      if (error.code === 'PGRST301' || error.message?.includes('401')) {
        throw new AuthExpiredError();
      }
      throw error;
    }

    await markSynced(dream.id);
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err;
    // Non-auth errors: mark for retry on next sync cycle
    console.error('Dream sync failed for', dream.id, err);
  }
}

export class AuthExpiredError extends Error {
  constructor() {
    super('Auth session expired during sync');
    this.name = 'AuthExpiredError';
  }
}
