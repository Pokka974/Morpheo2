import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, eq } from 'drizzle-orm';
import { supabase } from '../../supabase/client';
import { db, sqlite } from '@db/client';
import { dreams, media } from '@db/schema';

const PAGE_SIZE = 200;
/** No stored cursor means "never pulled" — start from the beginning of time so a
 * fresh install or a new device does a full backfill rather than "changes since now". */
const EPOCH = '1970-01-01T00:00:00.000Z';

const CURSOR_KEYS = {
  dreams: 'sync_dreams_last_pulled_at',
  interpretations: 'sync_interpretations_last_pulled_at',
  media: 'sync_media_last_pulled_at',
} as const;

interface RemoteDream {
  id: string;
  user_id: string;
  description: string;
  occurred_at: string;
  emotions: string[] | null;
  is_lucid: boolean;
  logged_at: string;
  last_modified_at: string;
  is_deleted: boolean;
  edited_since_interpretation: boolean;
}

interface RemoteInterpretation {
  id: string;
  dream_id: string;
  overall_reading: string;
  keywords: string[] | null;
  emotions: string[] | null;
  cultural_references: unknown;
  confidence: 'high' | 'medium' | 'low';
  is_degraded: boolean;
  prompt_version: string;
  model_used: string;
  created_at: string;
}

interface RemoteMedia {
  id: string;
  dream_id: string;
  media_type: 'image' | 'video';
  generation_status: 'pending' | 'processing' | 'complete' | 'failed' | 'safety_blocked';
  storage_key: string | null;
  regeneration_count: number;
  max_regenerations: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Brings this device's local SQLite up to date with Supabase: new rows created
 * elsewhere (another device, a server-side write) and — critically — deletions,
 * which nothing else in the app ever pulls down. Each table pulls independently so
 * one table's failure (a stale session, a transient network error) doesn't block
 * the others; it's simply retried on the next sync cycle via its own cursor.
 */
export async function pullRemoteChanges(userId: string): Promise<void> {
  await tryPull('dreams', () => pullDreams(userId));
  await tryPull('dream deletions', () => reconcileDreamDeletions(userId));
  await tryPull('interpretations', () => pullInterpretations(userId));
  await tryPull('media', () => pullMedia(userId));
}

async function tryPull(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`Pull sync failed for ${label}:`, err);
  }
}

async function getCursor(key: string): Promise<string> {
  return (await AsyncStorage.getItem(key)) ?? EPOCH;
}

async function pullDreams(userId: string): Promise<void> {
  let cursor = await getCursor(CURSOR_KEYS.dreams);

  for (;;) {
    const { data, error } = await supabase
      .from('dreams')
      .select(
        'id, user_id, description, occurred_at, emotions, is_lucid, logged_at, last_modified_at, is_deleted, edited_since_interpretation'
      )
      .eq('user_id', userId)
      .gt('last_modified_at', cursor)
      .order('last_modified_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Pull dreams failed:', error);
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data as RemoteDream[]) {
      await applyRemoteDream(row);
    }

    cursor = data[data.length - 1]!['last_modified_at'] as string;
    await AsyncStorage.setItem(CURSOR_KEYS.dreams, cursor);

    if (data.length < PAGE_SIZE) return;
  }
}

/**
 * Last-write-wins: a local row that was edited more recently than this remote
 * snapshot is left alone, so a pull can never clobber an edit that just hasn't
 * pushed yet. Otherwise the remote row (soft-delete included — `is_deleted`
 * mirrors straight across, same soft-delete pattern the rest of the app uses)
 * replaces the local one and is marked `synced` since it now matches the server.
 */
async function applyRemoteDream(row: RemoteDream): Promise<void> {
  const existing = await db.select().from(dreams).where(eq(dreams.id, row.id));
  const local = existing[0];
  if (
    local &&
    new Date(local.lastModifiedAt).getTime() >= new Date(row.last_modified_at).getTime()
  ) {
    return;
  }

  await sqlite.runAsync(
    `INSERT OR REPLACE INTO dreams
      (id, user_id, description, occurred_at, emotions, is_lucid, logged_at, last_modified_at, is_deleted, edited_since_interpretation, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [
      row.id,
      row.user_id,
      row.description,
      row.occurred_at,
      JSON.stringify(row.emotions ?? []),
      row.is_lucid ? 1 : 0,
      row.logged_at,
      row.last_modified_at,
      row.is_deleted ? 1 : 0,
      row.edited_since_interpretation ? 1 : 0,
    ]
  );
}

/**
 * The incremental pull above can only ever see a deletion if the row still exists
 * remotely with a fresher `last_modified_at` than what this device already has. But
 * `dreams_delete_own` RLS lets the owner hard-delete a row outright (e.g. via the
 * Supabase dashboard's row-delete action), which leaves nothing behind for an
 * incremental "what changed since my cursor" query to find — and a dashboard edit
 * that flips `is_deleted` without touching `last_modified_at` is invisible to it
 * too. This closes both gaps by diffing the full set of remote *active* dream ids
 * against every dream this device believes is synced and still active: anything
 * missing from the remote set gets marked deleted locally, regardless of how it
 * disappeared server-side.
 */
async function reconcileDreamDeletions(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('dreams')
    .select('id')
    .eq('user_id', userId)
    .eq('is_deleted', false);

  if (error) {
    console.error('Reconcile dream deletions failed:', error);
    return;
  }

  const remoteActiveIds = new Set((data as Array<{ id: string }> | null ?? []).map(row => row.id));

  // Only rows this device already believes are synced and active are candidates —
  // a not-yet-pushed local dream simply doesn't exist remotely yet, which must not
  // be mistaken for "was deleted".
  const candidates = await db
    .select()
    .from(dreams)
    .where(and(eq(dreams.syncStatus, 'synced'), eq(dreams.isDeleted, false)));

  for (const local of candidates) {
    if (!remoteActiveIds.has(local.id)) {
      await sqlite.runAsync(`UPDATE dreams SET is_deleted = 1 WHERE id = ?`, local.id);
    }
  }
}

/** Interpretations are never edited after creation, so this only ever fills in
 * rows this device hasn't seen yet — no LWW comparison needed. */
async function pullInterpretations(userId: string): Promise<void> {
  let cursor = await getCursor(CURSOR_KEYS.interpretations);

  for (;;) {
    const { data, error } = await supabase
      .from('interpretations')
      .select(
        'id, dream_id, overall_reading, keywords, emotions, cultural_references, confidence, is_degraded, prompt_version, model_used, created_at'
      )
      .eq('user_id', userId)
      .gt('created_at', cursor)
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Pull interpretations failed:', error);
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data as RemoteInterpretation[]) {
      await sqlite.runAsync(
        `INSERT OR IGNORE INTO interpretations
          (id, dream_id, overall_reading, keywords, emotions, cultural_references, confidence, is_degraded, prompt_version, model_used, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.dream_id,
          row.overall_reading,
          JSON.stringify(row.keywords ?? []),
          JSON.stringify(row.emotions ?? []),
          JSON.stringify(row.cultural_references ?? []),
          row.confidence,
          row.is_degraded ? 1 : 0,
          row.prompt_version,
          row.model_used,
          row.created_at,
        ]
      );
    }

    cursor = data[data.length - 1]!['created_at'] as string;
    await AsyncStorage.setItem(CURSOR_KEYS.interpretations, cursor);

    if (data.length < PAGE_SIZE) return;
  }
}

async function pullMedia(userId: string): Promise<void> {
  let cursor = await getCursor(CURSOR_KEYS.media);

  for (;;) {
    const { data, error } = await supabase
      .from('media')
      .select(
        'id, dream_id, media_type, generation_status, storage_key, regeneration_count, max_regenerations, error_message, created_at, updated_at'
      )
      .eq('user_id', userId)
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Pull media failed:', error);
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data as RemoteMedia[]) {
      await applyRemoteMedia(row);
    }

    cursor = data[data.length - 1]!['updated_at'] as string;
    await AsyncStorage.setItem(CURSOR_KEYS.media, cursor);

    if (data.length < PAGE_SIZE) return;
  }
}

/** `local_cache_path` is a device-local file path with no remote counterpart — it
 * has to be read back and re-supplied on every upsert or it would be wiped out
 * every time this device pulls its own media row back down. */
async function applyRemoteMedia(row: RemoteMedia): Promise<void> {
  const existing = await db.select().from(media).where(eq(media.id, row.id));
  const localCachePath = existing[0]?.localCachePath ?? null;

  await sqlite.runAsync(
    `INSERT INTO media
      (id, dream_id, media_type, generation_status, storage_key, local_cache_path, regeneration_count, max_regenerations, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       media_type = excluded.media_type,
       generation_status = excluded.generation_status,
       storage_key = excluded.storage_key,
       regeneration_count = excluded.regeneration_count,
       max_regenerations = excluded.max_regenerations,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
    [
      row.id,
      row.dream_id,
      row.media_type,
      row.generation_status,
      row.storage_key,
      localCachePath,
      row.regeneration_count,
      row.max_regenerations,
      row.error_message,
      row.created_at,
      row.updated_at,
    ]
  );
}
