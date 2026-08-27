import { supabase } from '../../supabase/client';
import { getPendingDreams, markSynced, purgeDreamLocally } from './dreamRepository';
import type { MediaCacheDeps } from '@features/sync/mediaCache';
import type { Dream } from '@db/schema';

/**
 * What a drain actually managed to push. A failed dream is not an exception — the
 * queue is offline-first and retries on the next cycle — but a caller that is about
 * to do something the server side depends on (interpreting, which inserts against a
 * FK on `dreams.id`) has to be able to tell that its own dream did not make it.
 */
export interface SyncOutcome {
  syncedIds: string[];
  failures: Array<{ dreamId: string; error: unknown }>;
}

/**
 * `deps` is only needed by the deletion path, which removes each purged dream's
 * cached image file. It is optional so the call sites that can never enqueue a
 * deletion (the post-save drain in the log screen, the dev seeder) stay unchanged;
 * everywhere a deletion can reach, pass `makeMediaCache(services)`.
 */
export async function syncPendingDreams(deps?: MediaCacheDeps): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { syncedIds: [], failures: [] };
  const pending = await getPendingDreams();
  if (pending.length === 0) return outcome;

  const sorted = [...pending].sort(
    (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
  );

  for (const dream of sorted) {
    const error = await syncDream(dream, deps);
    if (error === null) outcome.syncedIds.push(dream.id);
    else outcome.failures.push({ dreamId: dream.id, error });
  }
  return outcome;
}

/**
 * Drains the queue and insists that one specific dream reached Postgres.
 *
 * The interpret Edge Function inserts an `interpretations` row against a server-side
 * FK on `dreams.id`. If the dream is still local-only the insert fails deep inside the
 * function with a foreign-key violation the user sees as a generic "interpretation
 * unavailable" — so the caller checks here instead, where the reason is still known.
 */
export async function syncDreamForInterpretation(dreamId: string): Promise<void> {
  const outcome = await syncPendingDreams();
  const failure = outcome.failures.find(f => f.dreamId === dreamId);
  if (failure) throw new DreamNotSyncedError(dreamId, failure.error);
}

/** Returns `null` on success, or the error that stopped this dream from syncing. */
async function syncDream(dream: Dream, deps?: MediaCacheDeps): Promise<unknown> {
  // A locally deleted dream is a purge request, not an update to push (FR-032). Pushing
  // `is_deleted = true` — what this used to do — left the text, the interpretation, the
  // media rows and the stored PNG on the server indefinitely.
  if (dream.isDeleted) return purgeDream(dream, deps);

  try {
    const { error } = await supabase.from('dreams').upsert(
      {
        id: dream.id,
        user_id: dream.userId,
        description: dream.description,
        occurred_at: dream.occurredAt,
        // Stored as a JSON string locally (SQLite has no array type) but as TEXT[] on
        // Postgres, so it has to be parsed on the way out rather than passed through.
        emotions: parseJsonArray(dream.emotions),
        is_lucid: dream.isLucid,
        logged_at: dream.loggedAt,
        last_modified_at: dream.lastModifiedAt,
        is_deleted: dream.isDeleted,
        edited_since_interpretation: dream.editedSinceInterpretation,
        bedtime: dream.bedtime,
        wake_time: dream.wakeTime,
        sleep_quality: dream.sleepQuality,
        clarity: dream.clarity,
        lucidity: dream.lucidity,
        tone: dream.tone,
        dream_ending: dream.dreamEnding,
        dream_type: parseJsonArray(dream.dreamType),
        characters: parseJsonArray(dream.characters),
        places: parseJsonArray(dream.places),
        linked_dream_id: dream.linkedDreamId,
        // day_stress / presleep_substances are deliberately omitted: the "Contexte
        // personnel" block is local-only, per the design's privacy intent — never
        // sent to Supabase, never sent to the AI. See src/db/client.ts.
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
    return null;
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err;
    // Non-auth errors: the dream keeps its pending status and is retried on the next
    // sync cycle. It is reported rather than swallowed so a caller that depends on
    // this dream existing server-side can react.
    console.error('Dream sync failed for', dream.id, err);
    return err;
  }
}

/**
 * Permanently removes a deleted dream from Supabase, then from this device.
 *
 * Runs on the user's own client rather than through an Edge Function: `dreams_delete_own`
 * plus `GRANT ... DELETE ON dreams TO authenticated` (008) already allow the row delete,
 * `dream_media_delete_own` allows the object delete, and `interpretations` / `media` follow
 * the dream via `ON DELETE CASCADE` — referential actions run with the referencing table's
 * owner rights, so those two tables needing no DELETE policy of their own is not a problem.
 *
 * Order is the whole design here. The storage object goes first because `storage_key` is the
 * only pointer to it: delete the rows first and a failed bucket call orphans the PNG with
 * nothing left in the database to ever find it again. If the bucket call fails, the dream
 * keeps its pending status and the next drain retries — removing an already-absent key is
 * not an error, so a retry is safe.
 *
 * Returns `null` on success, or the error that stopped it, matching `syncDream`.
 */
async function purgeDream(dream: Dream, deps?: MediaCacheDeps): Promise<unknown> {
  try {
    const { data: mediaRows, error: mediaError } = await supabase
      .from('media')
      .select('id, storage_key')
      .eq('dream_id', dream.id);

    if (mediaError) throw asAuthAware(mediaError);

    const storageKeys = ((mediaRows ?? []) as Array<{ storage_key: string | null }>)
      .map(row => row.storage_key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0);

    if (storageKeys.length > 0) {
      const { error: removeError } = await supabase.storage.from('dream-media').remove(storageKeys);
      if (removeError) throw removeError;
    }

    const { error: deleteError } = await supabase.from('dreams').delete().eq('id', dream.id);
    if (deleteError) throw asAuthAware(deleteError);

    // Only now is the local row safe to drop: until this point it is the sole record
    // that a deletion still has to reach the server.
    await purgeDreamLocally(dream.id, deps);
    return null;
  } catch (err) {
    if (err instanceof AuthExpiredError) throw err;
    console.error('Dream purge failed for', dream.id, err);
    return err;
  }
}

/** PostgREST reports an expired session as a data-layer error; the queue has to treat it
 * as an auth failure so the caller can refresh instead of retrying forever. */
function asAuthAware(error: { code?: string | null; message?: string | null }): unknown {
  if (error.code === 'PGRST301' || error.message?.includes('401')) return new AuthExpiredError();
  return error;
}

/**
 * A dream written before 013 — or by a build that predates it — carries `'[]'`, but a
 * row corrupted mid-write would throw here and stall the whole queue. An unreadable
 * JSON array field is not worth losing the dream over, so it degrades to empty. Used
 * for `emotions`, `dream_type`, `characters` and `places` alike — all stored as a JSON
 * string locally (SQLite has no array type) but as `TEXT[]` on Postgres.
 */
function parseJsonArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    console.error('Unreadable JSON array payload on a dream; syncing it as empty:', raw);
    return [];
  }
}

export class AuthExpiredError extends Error {
  constructor() {
    super('Auth session expired during sync');
    this.name = 'AuthExpiredError';
  }
}

/** A dream is still local-only, so anything server-side keyed to it cannot proceed. */
export class DreamNotSyncedError extends Error {
  constructor(
    readonly dreamId: string,
    readonly reason: unknown
  ) {
    super(`Dream ${dreamId} did not reach the server`);
    this.name = 'DreamNotSyncedError';
  }
}
