import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, eq } from 'drizzle-orm';
import { supabase } from '../../supabase/client';
import { db, sqlite } from '@db/client';
import { dreams, media } from '@db/schema';
import { purgeDreamLocally } from '@features/dream-log/dreamRepository';
import { recordRecurrence } from '@features/recurrence/recurrenceRepository';
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

/**
 * Cursor *prefixes*, not keys — every one is qualified with the user id it belongs to
 * (see `cursorKey`). A cursor answers "what has this device already pulled", and the
 * answer is only ever true of one account: it is a high-water mark over that account's
 * own `last_modified_at` values.
 *
 * Sharing one key across accounts silently bricked the journal on account switch.
 * Signing into a second account left the first account's high-water mark in place, so
 * `gt(cursor)` matched none of the second account's older rows; signing back into the
 * first found its own cursor already past everything it owned. Either way the pull
 * reported success, wrote nothing, and left a permanently empty list that no amount of
 * pulling to refresh could fill.
 *
 * A qualified key also makes the recovery automatic: the old unqualified keys are
 * simply never read again, so every account starts from `EPOCH` once and backfills in
 * full.
 */
const CURSOR_KEYS = {
  dreams: 'sync_dreams_last_pulled_at',
  interpretations: 'sync_interpretations_last_pulled_at',
  media: 'sync_media_last_pulled_at',
  /** Not a pull cursor: how far the local recurrence rebuild has folded. */
  recurrence: 'sync_recurrence_folded_through',
} as const;

function cursorKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

type PullListener = () => void;
const pullListeners = new Set<PullListener>();

/** Reference-counted rather than a boolean: the sign-in pull and a pull-to-refresh can
 * overlap, and the second one finishing must not report the first as settled. */
let pullsInFlight = 0;

/**
 * Bumped on every call to `pullRemoteChanges`. `supabase.auth.onAuthStateChange` fires
 * on far more than sign-in — a token refresh, `INITIAL_SESSION`, the foreground handler,
 * the reconnect handler and a pull-to-refresh all call it too, none of them cancelling
 * whichever call is already in flight. Two calls for the *same* user racing is harmless:
 * every write below is idempotent. Two calls for *different* users racing is not — a
 * sign-out immediately followed by a sign-in (exactly what testing the account-delete
 * flow does) leaves the first call's `userId` stale in its closure while it's still
 * awaiting a network round trip. If that stale call's `purgeOtherAccountsData` or
 * `reconcileDreamDeletions` runs *after* the second call has already synced the new
 * account's dreams down, it reads those dreams as "belongs to a different account" or
 * "missing from my remote snapshot" and hard-deletes them locally — permanently, since
 * the dreams cursor is a high-water mark and won't re-fetch a dream it already applied
 * once. That is what turned "Skipped N interpretations whose dream is not on this
 * device" into a warning that repeats forever instead of resolving on the next pull.
 *
 * Each call captures the generation current when it starts; `isCurrentPull` lets it
 * notice a newer call has since started and bail out before doing anything destructive,
 * leaving the rest of the work to that newer call.
 */
let pullGeneration = 0;

/**
 * Whether any pull cycle is currently running. What it buys a screen is the difference
 * between "you have no dreams" and "your dreams haven't arrived yet" — a distinction an
 * empty local table cannot make on its own, and getting it wrong greets a returning user
 * with an empty-journal state on every fresh install.
 */
export function isPullInFlight(): boolean {
  return pullsInFlight > 0;
}

/**
 * Fires when a pull starts, when it has written something worth re-reading, and when it
 * settles.
 *
 * The pull on sign-in is fire-and-forget from `useAuthSync`, and by the time it lands the
 * journal is already mounted and has already read an empty table. Nothing then re-read
 * it: the list stayed empty until the user happened to navigate away and back, which is
 * what "the dreams are there but I can't load them" actually was.
 *
 * Firing *during* the cycle and not only at the end is the other half of that. A cycle
 * ends with `hydrateMediaCache`, which downloads up to 24 images — the dreams are
 * readable long before it returns, so a completion-only signal left the list blank for
 * the whole download, and made a pull-to-refresh (which awaits the same cycle) look like
 * it had done nothing at all.
 *
 * This carries no data, only the fact that there is now something new to read.
 */
export function subscribeToPullActivity(listener: PullListener): () => void {
  pullListeners.add(listener);
  return () => {
    pullListeners.delete(listener);
  };
}

/** One listener throwing must not stop the others from hearing about the pull. */
function notifyPullActivity(): void {
  for (const listener of pullListeners) {
    try {
      listener();
    } catch (err) {
      console.error('A pull-activity listener threw:', err);
    }
  }
}

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

/** Shared between `pullDreams`'s incremental page query and `recoverMissingDream`'s
 * point lookup — both need the same columns to build a `RemoteDream`. */
const DREAM_COLUMNS =
  'id, user_id, description, occurred_at, emotions, is_lucid, logged_at, last_modified_at, is_deleted, edited_since_interpretation, bedtime, wake_time, sleep_quality, clarity, lucidity, tone, dream_ending, dream_type, characters, places, linked_dream_id';

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
  const myGeneration = ++pullGeneration;
  // True only while no newer `pullRemoteChanges` call has started since this one did —
  // see `pullGeneration`. Checked before every step, not just the destructive ones:
  // once superseded, a step's writes are redundant with what the newer call is about
  // to do (or has already done), so there's nothing left for this call to contribute.
  const isCurrentPull = () => myGeneration === pullGeneration;

  // Announced before any work starts, so a journal that mounted a moment earlier can
  // tell "no dreams" from "not here yet" and hold its loading state.
  pullsInFlight += 1;
  notifyPullActivity();

  try {
    // First, and before anything reads or reconciles the local tables: this device may
    // still be holding the previous account's data.
    await tryPull('foreign-account cleanup', () =>
      purgeOtherAccountsData(userId, mediaCache, isCurrentPull)
    );
    if (!isCurrentPull()) return;
    await tryPull('dreams', () => pullDreams(userId, mediaCache));
    if (!isCurrentPull()) return;
    await tryPull('dream deletions', () =>
      reconcileDreamDeletions(userId, mediaCache, isCurrentPull)
    );
    // The journal is readable from here: every remaining pass only enriches the cards
    // that already exist. Waiting for them is what left the list blank.
    notifyPullActivity();
    if (!isCurrentPull()) return;

    await tryPull('interpretations', () => pullInterpretations(userId));
    if (!isCurrentPull()) return;
    // Immediately after, and only ever from interpretations already on this device.
    await tryPull('recurrence patterns', () => foldInterpretationsIntoRecurrence(userId));
    if (!isCurrentPull()) return;
    await tryPull('media', () => pullMedia(userId, mediaCache));
    notifyPullActivity();
    if (!isCurrentPull()) return;

    // Last, and only once the rows it works from are actually present. This is the slow
    // one — up to 24 image downloads — which is why nothing above waits on it.
    if (mediaCache) await tryPull('media cache', () => hydrateMediaCache(mediaCache));
  } finally {
    pullsInFlight -= 1;
    notifyPullActivity();
  }
}

/**
 * Local SQLite is one database shared by every account that has ever signed in on this
 * device — nothing is cleared on sign-out, because a dream logged offline and not yet
 * pushed would go with it. So a second account inherits the first one's rows, and every
 * screen that doesn't filter on `user_id` shows them as if they were its own.
 *
 * `dreams.user_id` is on every local row, which makes "not mine" exactly decidable
 * without tracking who owned the database last. Each foreign dream goes through
 * `purgeDreamLocally` rather than a bulk `DELETE` so its interpretation, its media rows
 * and its cached image files go with it; leaving the files behind would keep another
 * account's imagery on disk under this account's 200MB cap.
 *
 * `recurrence_patterns` carries its own `user_id` and no dream FK, so it is cleared
 * separately — otherwise the constellation would keep drawing the previous account's
 * symbols over the new account's (now empty) journal.
 *
 * `isCurrentPull` guards against a stale call rather than a stale row: this scan is
 * the first `await` in a whole `pullRemoteChanges` cycle, so a sign-out immediately
 * followed by a sign-in — exactly what testing account deletion does — can leave it
 * still running under the *old* account's `userId` after a newer call has already
 * synced the *new* account's dreams down. To this call, those dreams simply look like
 * they belong to someone else, and without the check it would delete a signed-in
 * account's own journal, permanently: the dreams cursor is a high-water mark and won't
 * re-fetch a dream it already applied once.
 */
async function purgeOtherAccountsData(
  userId: string,
  deps?: MediaCacheDeps,
  isCurrentPull: () => boolean = () => true
): Promise<void> {
  const foreign = await sqlite.getAllAsync<{ id: string }>(
    `SELECT id FROM dreams WHERE user_id != ?`,
    userId
  );
  if (!isCurrentPull()) return;

  for (const row of foreign) {
    await purgeDreamLocally(row.id, deps);
  }

  await sqlite.runAsync(`DELETE FROM recurrence_patterns WHERE user_id != ?`, userId);

  if (foreign.length > 0) {
    console.warn(`Removed ${foreign.length} dream(s) belonging to a previously signed-in account.`);
  }
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
 *
 * A recorded path is *not* taken as proof that the bytes are still there, which is why
 * this no longer filters on `local_cache_path IS NULL`. The cache lives under the OS
 * cache directory, and that file disappears behind the row's back in two ordinary
 * situations: iOS purges `Library/Caches` under storage pressure whenever it likes,
 * and the absolute path embeds an app-container id that is regenerated when the app
 * is reinstalled. Either way the row keeps a non-null path pointing at nothing, and
 * filtering on null meant hydration skipped exactly the rows that needed repair — the
 * image stayed blank permanently, with no sync cycle able to recover it. Checking the
 * filesystem costs one stat per row and makes the pass self-healing.
 */
async function hydrateMediaCache(deps: MediaCacheDeps): Promise<void> {
  // Every candidate, not the newest N. The limit now bounds *downloads* rather than
  // rows considered: since a row needing repair is no longer identifiable in SQL —
  // only the filesystem knows — a `LIMIT` here would keep re-examining the same
  // newest images and never reach an older one whose file went missing.
  const rows = await sqlite.getAllAsync<{ id: string }>(
    `SELECT id FROM media
      WHERE media_type = 'image'
        AND generation_status = 'complete'
        AND storage_key IS NOT NULL
      ORDER BY created_at DESC`
  );

  let downloaded = 0;
  for (const row of rows) {
    if (downloaded >= HYDRATION_LIMIT) break;
    try {
      // Cheap and local — and it is what separates "already cached" from "recorded
      // as cached but gone". Only the latter needs the network round-trip below.
      if (await deps.isCached(row.id)) continue;
      const signedUrl = await deps.getSignedUrl(row.id);
      const localPath = await deps.cacheMedia(row.id, signedUrl);
      downloaded += 1;
      await sqlite.runAsync(`UPDATE media SET local_cache_path = ? WHERE id = ?`, [
        localPath,
        row.id,
      ]);
    } catch (err) {
      // One unreachable object must not strand the rest of the batch. The row keeps
      // its existing cache path, so the next sync cycle simply tries it again.
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

async function getCursor(prefix: string, userId: string): Promise<string> {
  return (await AsyncStorage.getItem(cursorKey(prefix, userId))) ?? EPOCH;
}

async function setCursor(prefix: string, userId: string, value: string): Promise<void> {
  await AsyncStorage.setItem(cursorKey(prefix, userId), value);
}

/**
 * Forces the next pull for this account back to a full backfill from `EPOCH`, as if it
 * had never synced before. Recovery, not routine maintenance: a dream that the
 * superseded-pull race (see `pullGeneration`) purged locally before that guard existed
 * is gone for good from an *incremental* pull — its cursor already sits past a
 * `last_modified_at` it will never see again, which is exactly what let a handful of
 * interpretations and media rows point at a dream permanently missing from this
 * device. The dream itself was never touched server-side, so a full backfill recovers
 * it; nothing here talks to Supabase or SQLite directly.
 *
 * The recurrence cursor is included too, even though it tracks a purely local table
 * (`i.created_at > cursor` over interpretations already on this device, not a remote
 * query): the recovered interpretations carry their original, now-old `created_at`,
 * and without rewinding this cursor as well `foldInterpretationsIntoRecurrence` would
 * skip them as already folded — the constellation would recover the dreams and their
 * cards, but silently keep missing their stars.
 */
export async function resetSyncCursors(userId: string): Promise<void> {
  await AsyncStorage.multiRemove([
    cursorKey(CURSOR_KEYS.dreams, userId),
    cursorKey(CURSOR_KEYS.interpretations, userId),
    cursorKey(CURSOR_KEYS.media, userId),
    cursorKey(CURSOR_KEYS.recurrence, userId),
  ]);
}

async function pullDreams(userId: string, deps?: MediaCacheDeps): Promise<void> {
  let cursor = await getCursor(CURSOR_KEYS.dreams, userId);

  for (;;) {
    const { data, error } = await supabase
      .from('dreams')
      .select(DREAM_COLUMNS)
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
      await applyRemoteDream(row, deps);
    }

    cursor = data[data.length - 1]!['last_modified_at'] as string;
    await setCursor(CURSOR_KEYS.dreams, userId, cursor);

    if (data.length < PAGE_SIZE) return;
  }
}

/**
 * Last-write-wins: a local row that was edited more recently than this remote
 * snapshot is left alone, so a pull can never clobber an edit that just hasn't
 * pushed yet. Otherwise the remote row replaces the local one and is marked
 * `synced` since it now matches the server.
 *
 * A remote row still carrying `is_deleted` is purged locally instead of mirrored.
 * Deletion is a hard delete on both sides now (FR-032), so this only ever fires for
 * rows soft-deleted by a build that predates that change — but leaving them as local
 * tombstones would mean their text, interpretation and image survive on this device
 * forever, which is the very thing the deletion was supposed to prevent.
 *
 * `ON CONFLICT DO UPDATE` naming every synced column, rather than `INSERT OR
 * REPLACE`, is deliberate: `day_stress` and `presleep_substances` (the private
 * "Contexte personnel" block) exist only in local SQLite and are never selected
 * from Supabase above. A blanket `REPLACE` would silently reset both columns to
 * their defaults on every pull; leaving them out of the `DO UPDATE SET` list
 * instead means an existing row keeps whatever it already had, and a brand-new
 * row falls back to the column defaults exactly once.
 */
async function applyRemoteDream(row: RemoteDream, deps?: MediaCacheDeps): Promise<void> {
  const existing = await db.select().from(dreams).where(eq(dreams.id, row.id));
  const local = existing[0];
  if (
    local &&
    new Date(local.lastModifiedAt).getTime() >= new Date(row.last_modified_at).getTime()
  ) {
    return;
  }

  if (row.is_deleted) {
    await purgeDreamLocally(row.id, deps);
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
 * `dreams_delete_own` RLS lets the owner hard-delete a row outright, which leaves
 * nothing behind for an incremental "what changed since my cursor" query to find —
 * and a dashboard edit that flips `is_deleted` without touching `last_modified_at`
 * is invisible to it too. This closes both gaps by diffing the full set of remote
 * *active* dream ids against every dream this device believes is synced and still
 * active: anything missing from the remote set is purged locally, regardless of how
 * it disappeared server-side.
 *
 * That diff is also how a deletion made on another device now reaches this one:
 * `syncService.purgeDream` deletes the remote row outright, so there is no tombstone
 * for the incremental pull to carry and this is the pass that notices.
 *
 * `isCurrentPull` guards the same race `purgeOtherAccountsData` does: the network
 * round trip above is long enough for a sign-out immediately followed by a sign-in to
 * land a newer pull's dreams before this stale one resumes. Under the old (superseded)
 * account those dreams aren't in `remoteActiveIds` — that set was fetched for the old
 * account — so without the check every one of the new account's just-synced dreams
 * reads as "deleted remotely" and gets purged.
 */
async function reconcileDreamDeletions(
  userId: string,
  deps?: MediaCacheDeps,
  isCurrentPull: () => boolean = () => true
): Promise<void> {
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
  if (!isCurrentPull()) return;

  const remoteActiveIds = new Set(
    ((data as Array<{ id: string }> | null) ?? []).map(row => row.id)
  );

  // Only rows this device already believes are synced and active are candidates —
  // a not-yet-pushed local dream simply doesn't exist remotely yet, which must not
  // be mistaken for "was deleted".
  //
  // And only rows belonging to `userId`. `remoteActiveIds` is one account's dreams,
  // so without this scope every *other* account's local dreams are missing from it by
  // construction and get purged as "deleted remotely" — signing into a second account
  // permanently destroyed the first account's journal on this device.
  const candidates = await db
    .select()
    .from(dreams)
    .where(
      and(eq(dreams.userId, userId), eq(dreams.syncStatus, 'synced'), eq(dreams.isDeleted, false))
    );

  for (const local of candidates) {
    if (!remoteActiveIds.has(local.id)) {
      await purgeDreamLocally(local.id, deps);
    }
  }
}

/**
 * Both `interpretations.dream_id` and `media.dream_id` are `NOT NULL REFERENCES
 * dreams(id)` in local SQLite, with `PRAGMA foreign_keys = ON` — so inserting a child
 * whose dream isn't on this device doesn't skip the row, it throws "FOREIGN KEY
 * constraint failed" out of the whole pull.
 *
 * That happens for real: a dream soft-deleted remotely is purged locally by
 * `applyRemoteDream` rather than mirrored, and a dream hard-deleted directly in the
 * database leaves its children behind if the delete didn't cascade — either way the
 * child rows are still selectable and still arrive here. Since the throw escapes
 * before the cursor is written, the very same page is refetched and fails again on
 * every subsequent cycle: that table's sync is stuck for good, which is why the
 * journal list stayed imageless no matter how many times it was pulled to refresh.
 */
async function dreamExistsLocally(dreamId: string): Promise<boolean> {
  const row = await sqlite.getFirstAsync<{ id: string }>(
    `SELECT id FROM dreams WHERE id = ? LIMIT 1`,
    dreamId
  );
  return row != null;
}

/**
 * The fallback `dreamExistsLocally` reaches for before giving up on an orphan.
 * `pullDreams` runs first in every cycle and normally means this is never needed —
 * but "normally" isn't "always", and a cursor never revisits a row it has already
 * advanced past. Anything that once desyncs a dream from its children — a version of
 * this pull racing a sign-out/sign-in before `pullGeneration` existed and guarded
 * against it, a dropped connection mid-page, a future bug nobody's found yet — leaves
 * that dream permanently unrecoverable to an incremental pull, even though the row is
 * still sitting on the server the whole time. Without this, the only way back was a
 * full `resetSyncCursors` backfill; a symptom that repeats identically forever, with
 * no cursor advancing and nothing to distinguish "will resolve next cycle" from "never
 * will", is exactly the shape of that failure mode.
 *
 * A point lookup by id rather than waiting for the cursor to reach it. Returns whether
 * the dream is on this device now — `false` covers both "genuinely deleted" and "the
 * lookup itself failed", and either way the caller's existing skip-and-warn behaviour
 * is unchanged.
 *
 * Caught rather than left to escape: this runs once per orphaned row inside a page
 * loop, and a network hiccup on this one lookup must not take down every row behind
 * it in the same page — the existing skip-and-warn path already handles "couldn't
 * recover this one" without losing anything else.
 */
async function recoverMissingDream(dreamId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('dreams')
      .select(DREAM_COLUMNS)
      .eq('id', dreamId)
      .maybeSingle();

    if (error || !data) return false;
    const row = data as RemoteDream;
    if (row.is_deleted) return false;

    await applyRemoteDream(row);
    return true;
  } catch (err) {
    console.error(`Failed to recover dream ${dreamId} for an orphaned child row:`, err);
    return false;
  }
}

/**
 * The cursor may only advance over rows that were actually applied. An orphan is
 * usually permanent (its dream is deleted), but it is indistinguishable here from a
 * dream that simply hasn't arrived yet — the dreams pull failing earlier in this same
 * cycle produces exactly the same state. Clamping at the first skipped row costs one
 * re-read of one page per cycle; advancing past it would drop that interpretation or
 * image on this device permanently.
 */
function reportSkipped(label: string, skipped: string[]): void {
  if (skipped.length === 0) return;
  console.warn(
    `Skipped ${skipped.length} ${label} whose dream is not on this device ` +
      `(deleted remotely, or its dream has yet to sync): ${skipped.join(', ')}`
  );
}

/** Interpretations are never edited after creation, so this only ever fills in
 * rows this device hasn't seen yet — no LWW comparison needed. */
async function pullInterpretations(userId: string): Promise<void> {
  const startCursor = await getCursor(CURSOR_KEYS.interpretations, userId);
  let cursor = startCursor;
  let appliedCursor = startCursor;
  let clamped = false;
  const skipped: string[] = [];

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
      reportSkipped('interpretations', skipped);
      return;
    }
    if (!data || data.length === 0) {
      reportSkipped('interpretations', skipped);
      return;
    }

    for (const row of data as RemoteInterpretation[]) {
      if (!(await dreamExistsLocally(row.dream_id)) && !(await recoverMissingDream(row.dream_id))) {
        skipped.push(row.id);
        clamped = true;
        continue;
      }

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

      if (!clamped) appliedCursor = row.created_at;
    }

    cursor = data[data.length - 1]!['created_at'] as string;
    if (appliedCursor !== startCursor) {
      await setCursor(CURSOR_KEYS.interpretations, userId, appliedCursor);
    }

    if (data.length < PAGE_SIZE) {
      reportSkipped('interpretations', skipped);
      return;
    }
  }
}

/**
 * `recurrence_patterns` is the constellation's entire data source, and until now the
 * only thing that ever wrote it was `interpretation.tsx`, on the one device that ran
 * the interpretation. Nothing pulls it: a fresh install (or a second device) can sync
 * every dream and every interpretation it owns and still be told it has "not enough
 * dreams yet", however many are sitting in the journal.
 *
 * Rebuilding locally is preferred over pulling the remote table, which cannot serve
 * this screen: remote `recurrence_patterns` has no `dream_ids` column, so the
 * constellation would draw stars with no edges between them, and its `pattern_type`
 * CHECK predates `'theme'` entirely. The local interpretations rows carry keywords,
 * emotions, themes and the dream id — everything the chart needs.
 *
 * `recordRecurrence` is idempotent per (term, dream), so the device that already
 * recorded a dream re-folds it as a no-op touch, and a cursor that slips back merely
 * repeats work. `created_at` is passed as `seenAt` rather than "now" on purpose:
 * `getTopRecurrences` filters on `last_seen_at`, so stamping a backfill with the
 * current time would make every old symbol look like it recurred today.
 */
async function foldInterpretationsIntoRecurrence(userId: string): Promise<void> {
  const cursor = await getCursor(CURSOR_KEYS.recurrence, userId);

  const rows = await sqlite.getAllAsync<{
    dream_id: string;
    keywords: string;
    emotions: string;
    themes: string;
    created_at: string;
  }>(
    `SELECT i.dream_id, i.keywords, i.emotions, i.themes, i.created_at
       FROM interpretations i
       JOIN dreams d ON d.id = i.dream_id
      WHERE i.created_at > ?
        AND d.user_id = ?
        AND d.is_deleted = 0
      ORDER BY i.created_at ASC`,
    [cursor, userId]
  );

  for (const row of rows) {
    await recordRecurrence(
      userId,
      row.dream_id,
      'keyword',
      parseTerms(row.keywords),
      row.created_at
    );
    await recordRecurrence(
      userId,
      row.dream_id,
      'emotion',
      parseTerms(row.emotions),
      row.created_at
    );
    await recordRecurrence(userId, row.dream_id, 'theme', parseTerms(row.themes), row.created_at);
    await setCursor(CURSOR_KEYS.recurrence, userId, row.created_at);
  }
}

/** The three term columns are JSON arrays written by the interpretation Edge Function;
 * a malformed one costs that dream its stars, never the whole rebuild. */
function parseTerms(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

async function pullMedia(userId: string, deps?: MediaCacheDeps): Promise<void> {
  const startCursor = await getCursor(CURSOR_KEYS.media, userId);
  let cursor = startCursor;
  let appliedCursor = startCursor;
  let clamped = false;
  const skipped: string[] = [];

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
      reportSkipped('media rows', skipped);
      return;
    }
    if (!data || data.length === 0) {
      reportSkipped('media rows', skipped);
      return;
    }

    for (const row of data as RemoteMedia[]) {
      if (!(await dreamExistsLocally(row.dream_id)) && !(await recoverMissingDream(row.dream_id))) {
        skipped.push(row.id);
        clamped = true;
        continue;
      }

      await applyRemoteMedia(row, deps);
      if (!clamped) appliedCursor = row.updated_at;
    }

    cursor = data[data.length - 1]!['updated_at'] as string;
    if (appliedCursor !== startCursor) {
      await setCursor(CURSOR_KEYS.media, userId, appliedCursor);
    }

    if (data.length < PAGE_SIZE) {
      reportSkipped('media rows', skipped);
      return;
    }
  }
}

/** `local_cache_path` is a device-local file path with no remote counterpart — it
 * has to be read back and re-supplied on every upsert or it would be wiped out
 * every time this device pulls its own media row back down.
 *
 * Unless the object underneath it changed. A regeneration updates the media row in
 * place, so the row arrives here with the same id and a *different* `storage_key`,
 * and the cached file — named after the id — is now the superseded image. Carrying
 * the path forward would leave this device showing the old picture forever, since
 * `hydrateMediaCache` only fills in null paths and `cacheMedia` skips a file that
 * already exists. Dropping both the file and the path re-queues it for download on
 * this same pass.
 *
 * The `existing.storageKey !== null` guard matters: the device that generated the
 * image writes its own row through `persistLocally`, which has no `storage_key` to
 * write, so every first generation would otherwise throw away the file it had just
 * downloaded and fetch it a second time. */
async function applyRemoteMedia(row: RemoteMedia, deps?: MediaCacheDeps): Promise<void> {
  const existing = await db.select().from(media).where(eq(media.id, row.id));
  const previousStorageKey = existing[0]?.storageKey ?? null;
  const objectReplaced =
    previousStorageKey !== null &&
    row.storage_key !== null &&
    previousStorageKey !== row.storage_key;

  let localCachePath = existing[0]?.localCachePath ?? null;
  if (objectReplaced && localCachePath && deps) {
    try {
      await deps.removeCachedMedia(row.id);
      localCachePath = null;
    } catch (err) {
      // Keep the stale path rather than clearing it while the file is still there:
      // `cacheMedia` would short-circuit on it and re-record the same stale image.
      // The next pull sees the same mismatch and tries again.
      console.error(`Failed to drop the superseded cache file for media ${row.id}:`, err);
    }
  }

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
