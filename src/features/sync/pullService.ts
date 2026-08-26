import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, eq } from 'drizzle-orm';
import { supabase } from '../../supabase/client';
import { db, sqlite } from '@db/client';
import { dreams, media } from '@db/schema';
import type { MediaCacheDeps } from './mediaCache';

const PAGE_SIZE = 200;
/** Ceiling on how many images one sync cycle will download. The journal list pages
 * at 20, so the newest 24 cover the first screenful plus scroll headroom; anything
 * older is picked up by later cycles rather than making a fresh device sit through
 * hundreds of downloads before its first sync completes. */
const HYDRATION_LIMIT = 24;
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
  bedtime: string | null;
  wake_time: string | null;
  sleep_quality: number | null;
  clarity: number | null;
  lucidity: string;
  tone: string | null;
  dream_ending: string | null;
  dream_type: string[] | null;
  characters: string[] | null;
  places: string[] | null;
  linked_dream_id: string | null;
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
  archetype: string | null;
  themes: string[] | null;
  symbolic_density: number | null;
  image_prompt: string | null;
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
export async function pullRemoteChanges(
  userId: string,
  mediaCache?: MediaCacheDeps
): Promise<void> {
  await tryPull('dreams', () => pullDreams(userId));
  await tryPull('dream deletions', () => reconcileDreamDeletions(userId));
  await tryPull('interpretations', () => pullInterpretations(userId));
  await tryPull('media', () => pullMedia(userId));
  // Last, and only once the rows it works from are actually present.
  if (mediaCache) await tryPull('media cache', () => hydrateMediaCache(mediaCache));
}

/**
 * `pullMedia` brings the media row down but never the bytes: `local_cache_path` is
 * device-local and has no remote counterpart, so an image generated on another
 * device arrives with `storage_key` set and nothing displayable behind it. Both the
 * journal list and the detail screen read `local_cache_path` and nothing else, which
 * is why such a dream shows no image no matter how many times it syncs.
 *
 * This downloads each such image once and records the resulting file. The signed URL
 * is deliberately not persisted — it expires within the hour, whereas the cached file
 * keeps working offline and is managed by the same 200MB eviction cap as any other
 * cached media.
 */
async function hydrateMediaCache(deps: MediaCacheDeps): Promise<void> {
  const rows = await sqlite.getAllAsync<{ id: string }>(
    `SELECT id FROM media
      WHERE media_type = 'image'
        AND generation_status = 'complete'
        AND storage_key IS NOT NULL
        AND local_cache_path IS NULL
      ORDER BY created_at DESC
      LIMIT ?`,
    HYDRATION_LIMIT
  );

  for (const row of rows) {
    try {
      const signedUrl = await deps.getSignedUrl(row.id);
      const localPath = await deps.cacheMedia(row.id, signedUrl);
      await sqlite.runAsync(`UPDATE media SET local_cache_path = ? WHERE id = ?`, [
        localPath,
        row.id,
      ]);
    } catch (err) {
      // One unreachable object must not strand the rest of the batch. The row keeps
      // its null cache path, so the next sync cycle simply tries it again.
      console.error(`Failed to cache media ${row.id}:`, err);
    }
  }
}

/**
 * PostgREST rejections that come from the auth layer rather than the data layer.
 * The access token lives in SecureStore and is replayed on every subsequent request
 * until it expires, so a single bad token turns one failure into a sustained stream
 * of them — which is precisely the case worth refreshing for.
 *
 * `PGRST301` — the JWT is expired or otherwise fails validation.
 * `PGRST303` — the JWT's `iat` is ahead of PostgREST's own clock ("JWT issued at
 *   future"), i.e. clock skew between the token's issuer and the API.
 */
const STALE_SESSION_CODES = new Set(['PGRST301', 'PGRST303']);

/** Signals that a pull failed because of the session rather than the data, so
 * `tryPull` can refresh and retry instead of silently giving up. */
class StaleSessionError extends Error {
  constructor(label: string, code: string, detail: string) {
    super(`${label} was rejected by the session (${code}): ${detail}`);
    this.name = 'StaleSessionError';
  }
}

/**
 * Each pull below aborts on error, which is indistinguishable from "nothing new":
 * the cursor stays put and the next cycle simply retries. That is the right response
 * to a transient network error, but not to a stale session — the very same token
 * would be replayed every cycle, silently no-op'ing the sync until it expires.
 * Those get promoted to a throw so `tryPull` can do something about them.
 */
function assertSessionUsable(
  label: string,
  error: { code?: string | null; message?: string | null }
): void {
  const code = error.code ?? '';
  if (STALE_SESSION_CODES.has(code)) {
    throw new StaleSessionError(label, code, error.message ?? 'no detail');
  }
}

async function tryPull(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof StaleSessionError) {
      await retryWithFreshSession(label, fn, err);
      return;
    }
    console.error(`Pull sync failed for ${label}:`, err);
  }
}

/**
 * Retried exactly once, and only after the refresh itself has succeeded. Replaying a
 * whole pull is safe: each one re-reads its cursor from AsyncStorage on entry and
 * every write is idempotent (`ON CONFLICT DO UPDATE` / `INSERT OR IGNORE`). A second
 * failure is left to the next sync cycle rather than looped on — if the refresh is
 * what's broken, retrying harder only burns requests.
 */
async function retryWithFreshSession(
  label: string,
  fn: () => Promise<void>,
  cause: StaleSessionError
): Promise<void> {
  console.warn(`${cause.message} — refreshing the session and retrying once.`);

  const { error } = await supabase.auth.refreshSession();
  if (error) {
    console.error(`Session refresh failed, leaving ${label} for the next sync:`, error);
    return;
  }

  try {
    await fn();
  } catch (err) {
    console.error(`Pull sync failed for ${label} even after a session refresh:`, err);
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
        'id, user_id, description, occurred_at, emotions, is_lucid, logged_at, last_modified_at, is_deleted, edited_since_interpretation, bedtime, wake_time, sleep_quality, clarity, lucidity, tone, dream_ending, dream_type, characters, places, linked_dream_id'
      )
      .eq('user_id', userId)
      .gt('last_modified_at', cursor)
      .order('last_modified_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      assertSessionUsable('Pull dreams', error);
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
 *
 * `ON CONFLICT DO UPDATE` naming every synced column, rather than `INSERT OR
 * REPLACE`, is deliberate: `day_stress` and `presleep_substances` (the private
 * "Contexte personnel" block) exist only in local SQLite and are never selected
 * from Supabase above. A blanket `REPLACE` would silently reset both columns to
 * their defaults on every pull; leaving them out of the `DO UPDATE SET` list
 * instead means an existing row keeps whatever it already had, and a brand-new
 * row falls back to the column defaults exactly once.
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
    `INSERT INTO dreams
      (id, user_id, description, occurred_at, emotions, is_lucid, logged_at, last_modified_at, is_deleted, edited_since_interpretation, sync_status,
       bedtime, wake_time, sleep_quality, clarity, lucidity, tone, dream_ending, dream_type, characters, places, linked_dream_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       description = excluded.description,
       occurred_at = excluded.occurred_at,
       emotions = excluded.emotions,
       is_lucid = excluded.is_lucid,
       logged_at = excluded.logged_at,
       last_modified_at = excluded.last_modified_at,
       is_deleted = excluded.is_deleted,
       edited_since_interpretation = excluded.edited_since_interpretation,
       sync_status = excluded.sync_status,
       bedtime = excluded.bedtime,
       wake_time = excluded.wake_time,
       sleep_quality = excluded.sleep_quality,
       clarity = excluded.clarity,
       lucidity = excluded.lucidity,
       tone = excluded.tone,
       dream_ending = excluded.dream_ending,
       dream_type = excluded.dream_type,
       characters = excluded.characters,
       places = excluded.places,
       linked_dream_id = excluded.linked_dream_id`,
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
      row.bedtime,
      row.wake_time,
      row.sleep_quality,
      row.clarity,
      row.lucidity,
      row.tone,
      row.dream_ending,
      JSON.stringify(row.dream_type ?? []),
      JSON.stringify(row.characters ?? []),
      JSON.stringify(row.places ?? []),
      row.linked_dream_id,
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
    assertSessionUsable('Reconcile dream deletions', error);
    console.error('Reconcile dream deletions failed:', error);
    return;
  }

  const remoteActiveIds = new Set(
    ((data as Array<{ id: string }> | null) ?? []).map(row => row.id)
  );

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
        'id, dream_id, overall_reading, keywords, emotions, cultural_references, confidence, is_degraded, prompt_version, model_used, created_at, archetype, themes, symbolic_density, image_prompt'
      )
      .eq('user_id', userId)
      .gt('created_at', cursor)
      .order('created_at', { ascending: true })
      .limit(PAGE_SIZE);

    if (error) {
      assertSessionUsable('Pull interpretations', error);
      console.error('Pull interpretations failed:', error);
      return;
    }
    if (!data || data.length === 0) return;

    for (const row of data as RemoteInterpretation[]) {
      await sqlite.runAsync(
        `INSERT OR IGNORE INTO interpretations
          (id, dream_id, overall_reading, keywords, emotions, cultural_references, confidence, is_degraded, prompt_version, model_used, created_at, archetype, themes, symbolic_density, image_prompt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          row.archetype,
          JSON.stringify(row.themes ?? []),
          row.symbolic_density,
          row.image_prompt,
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
      assertSessionUsable('Pull media', error);
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
