import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockFrom = jest.fn();
const mockRefreshSession = jest.fn();
// Mock supabase client before import to avoid env var validation throwing — same
// resolved module (`src/supabase/client`) as syncService.test.ts mocks.
jest.mock('@features/../supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { refreshSession: (...args: unknown[]) => mockRefreshSession(...args) },
  },
}));

const mockSelectWhere = jest.fn();
const mockRunAsync = jest.fn();
const mockGetAllAsync = jest.fn();
/** Backs `dreamExistsLocally`: the parent-dream lookup every interpretation and media
 * row is checked against before it is inserted. Defaults to "the dream is here". */
const mockGetFirstAsync = jest.fn();
jest.mock('@db/client', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: (...args: unknown[]) => mockSelectWhere(...args),
      })),
    })),
  },
  sqlite: {
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getAllAsync: (...args: unknown[]) => mockGetAllAsync(...args),
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
  },
}));

// The local purge itself (children before parent, cache files, transaction) is covered
// in dreamRepository.test.ts. What matters here is only that the pull reaches for it.
const mockPurgeDreamLocally = jest.fn();
jest.mock('@features/dream-log/dreamRepository', () => ({
  purgeDreamLocally: (...args: unknown[]) => mockPurgeDreamLocally(...args),
}));

// The upsert-per-term itself is covered in recurrenceRepository.test.ts; what matters
// here is that the pull folds every synced interpretation into it.
const mockRecordRecurrence = jest.fn();
jest.mock('@features/recurrence/recurrenceRepository', () => ({
  recordRecurrence: (...args: unknown[]) => mockRecordRecurrence(...args),
}));

import {
  isPullInFlight,
  pullRemoteChanges,
  resetSyncCursors,
  subscribeToPullActivity,
} from '@features/sync/pullService';

/** Builds a chainable query-builder stub matching how pullService calls the
 * Supabase client. Most queries end in an explicit `.limit()`; the deletion
 * reconciliation query doesn't call `.limit()` at all and instead awaits the
 * builder directly (real supabase-js query builders are themselves thenable); the
 * missing-dream point lookup ends in `.maybeSingle()` instead — so this stub
 * supports all three terminal styles. */
function chainable(result: { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'gt', 'order']) {
    builder[method] = jest.fn(() => builder);
  }
  builder['limit'] = jest.fn(() => Promise.resolve(result));
  // Real `.maybeSingle()` never resolves an array — zero matches is `data: null`, one
  // match is the row itself. Reducing the fixture's list here (rather than asking
  // every test to hand-shape both a list and a single-row result) is what keeps a bare
  // `chainable(EMPTY)` correctly reading as "no such dream" for the point lookup, the
  // same as it already does for the paged queries.
  builder['maybeSingle'] = jest.fn(() => {
    const { data, error } = result;
    return Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error });
  });
  builder['then'] = jest.fn((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  );
  return builder;
}

const EMPTY = { data: [], error: null };

/**
 * The columns a drizzle `where` condition actually names. `and(eq(a, …), eq(b, …))`
 * builds a nested SQL object rather than a string, so asserting on the *shape* of the
 * scope means walking its chunks for the `Column` instances — each of which carries the
 * underlying SQLite column name.
 */
function columnNamesIn(condition: unknown, seen = new Set<unknown>()): string[] {
  if (condition == null || typeof condition !== 'object' || seen.has(condition)) return [];
  seen.add(condition);

  const record = condition as Record<string, unknown>;
  const names: string[] = [];
  if (typeof record['name'] === 'string' && 'table' in record) names.push(record['name']);

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) names.push(...columnNamesIn(item, seen));
    } else if (value && typeof value === 'object') {
      names.push(...columnNamesIn(value, seen));
    }
  }
  return names;
}

const baseRemoteDream = {
  id: 'dream-1',
  user_id: 'user-1',
  description: 'A remote dream description long enough to pass validation.',
  occurred_at: '2026-08-01',
  emotions: ['calm'],
  is_lucid: false,
  logged_at: '2026-08-01T00:00:00.000Z',
  last_modified_at: '2026-08-02T00:00:00.000Z',
  is_deleted: false,
  edited_since_interpretation: false,
  bedtime: null,
  wake_time: null,
  sleep_quality: null,
  clarity: null,
  lucidity: 'none',
  tone: null,
  dream_ending: null,
  dream_type: [],
  characters: [],
  places: [],
  linked_dream_id: null,
};

/** How PostgREST reports a token whose `iat` is ahead of its own clock — the token
 * is cached client-side and replayed until it expires, so it cannot be waited out. */
const STALE_SESSION = {
  data: null,
  error: { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null },
};

const mediaCache = {
  getSignedUrl: jest.fn<Promise<string>, [string]>(),
  cacheMedia: jest.fn<Promise<string>, [string, string]>(),
  removeCachedMedia: jest.fn<Promise<void>, [string]>(),
  // Defaults to "nothing is on this device", which is the state every existing
  // hydration case was written against.
  isCached: jest.fn<Promise<boolean>, [string]>(),
};

describe('pullRemoteChanges', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockFrom.mockReset();
    mockSelectWhere.mockReset().mockResolvedValue([]);
    mockRunAsync.mockReset().mockResolvedValue(undefined);
    mockGetAllAsync.mockReset().mockResolvedValue([]);
    mockGetFirstAsync.mockReset().mockResolvedValue({ id: 'dream-1' });
    mockRecordRecurrence.mockReset().mockResolvedValue(undefined);
    mediaCache.getSignedUrl.mockReset().mockResolvedValue('https://example.com/signed.png');
    mediaCache.cacheMedia.mockReset().mockResolvedValue('/local/media/media-1.png');
    mediaCache.removeCachedMedia.mockReset().mockResolvedValue(undefined);
    mediaCache.isCached.mockReset().mockResolvedValue(false);
    mockPurgeDreamLocally.mockReset().mockResolvedValue(undefined);
    mockRefreshSession.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
    await AsyncStorage.clear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('does a full backfill from the epoch when no cursor has been stored yet', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') {
        return chainable({ data: [baseRemoteDream], error: null });
      }
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    const dreamsBuilder = mockFrom.mock.results.find(
      (_, i) => mockFrom.mock.calls[i]?.[0] === 'dreams'
    )!.value;
    expect(dreamsBuilder.gt).toHaveBeenCalledWith('last_modified_at', '1970-01-01T00:00:00.000Z');
  });

  // Deletion is a hard delete on both sides now (FR-032), so a remote row still
  // carrying is_deleted only arrives from a build predating that. Writing it in as a
  // local tombstone — what this used to do — would leave the text, interpretation and
  // image sitting on this device permanently.
  it('purges a remote soft-deleted dream locally instead of mirroring the tombstone', async () => {
    const deleted = { ...baseRemoteDream, id: 'dream-deleted', is_deleted: true };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [deleted], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1', mediaCache);

    expect(mockPurgeDreamLocally).toHaveBeenCalledWith('dream-deleted', mediaCache);
    expect(mockRunAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dreams'),
      expect.arrayContaining(['dream-deleted'])
    );
  });

  describe('deletion reconciliation (catches a hard delete or a dashboard edit that never bumped last_modified_at)', () => {
    /** The incremental pull's `.limit()`-terminated pages come first; the
     * reconciliation query (no `.limit()`) is always the next 'dreams' call after. */
    function sequencedDreamsResponses(
      responses: Array<{ data: unknown[] | null; error: unknown }>
    ) {
      let call = 0;
      return (table: string) => {
        if (table !== 'dreams') return chainable(EMPTY);
        const result = responses[Math.min(call, responses.length - 1)]!;
        call += 1;
        return chainable(result);
      };
    }

    it('purges a synced local dream when it is absent from the remote active set', async () => {
      mockFrom.mockImplementation(sequencedDreamsResponses([EMPTY, { data: [], error: null }]));
      mockSelectWhere.mockResolvedValue([
        {
          id: 'dream-1',
          userId: 'user-1',
          description: 'A dream this device thinks is still active.',
          occurredAt: '2026-08-01',
          emotions: '[]',
          isLucid: false,
          loggedAt: '2026-08-01T00:00:00.000Z',
          lastModifiedAt: '2026-08-01T00:00:00.000Z',
          isDeleted: false,
          editedSinceInterpretation: false,
          syncStatus: 'synced',
        },
      ]);

      await pullRemoteChanges('user-1', mediaCache);

      expect(mockPurgeDreamLocally).toHaveBeenCalledWith('dream-1', mediaCache);
    });

    it('leaves a local dream alone when it is still present in the remote active set', async () => {
      mockFrom.mockImplementation(
        sequencedDreamsResponses([EMPTY, { data: [{ id: 'dream-1' }], error: null }])
      );
      mockSelectWhere.mockResolvedValue([
        {
          id: 'dream-1',
          userId: 'user-1',
          description: 'A dream that is still active remotely.',
          occurredAt: '2026-08-01',
          emotions: '[]',
          isLucid: false,
          loggedAt: '2026-08-01T00:00:00.000Z',
          lastModifiedAt: '2026-08-01T00:00:00.000Z',
          isDeleted: false,
          editedSinceInterpretation: false,
          syncStatus: 'synced',
        },
      ]);

      await pullRemoteChanges('user-1', mediaCache);

      expect(mockPurgeDreamLocally).not.toHaveBeenCalled();
    });

    it('does not fail the whole pull when the reconciliation query errors', async () => {
      mockFrom.mockImplementation(
        sequencedDreamsResponses([EMPTY, { data: null, error: { message: 'boom' } }])
      );

      await expect(pullRemoteChanges('user-1')).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Reconcile dream deletions failed:',
        expect.objectContaining({ message: 'boom' })
      );
    });

    /**
     * `remoteActiveIds` is one account's dreams. An unscoped candidate set therefore
     * contained every *other* account's local dreams too, none of which can possibly
     * appear in that set — so signing into a second account on the same device silently
     * hard-deleted the first account's entire journal, interpretations and images
     * included.
     */
    it('restricts the candidate set to the signed-in account', async () => {
      mockFrom.mockImplementation(sequencedDreamsResponses([EMPTY, { data: [], error: null }]));

      await pullRemoteChanges('user-1');

      expect(mockSelectWhere).toHaveBeenCalled();
      const condition = mockSelectWhere.mock.calls.at(-1)?.[0];
      expect(columnNamesIn(condition)).toContain('user_id');
    });
  });

  /**
   * A cycle ends with `hydrateMediaCache`, which downloads up to 24 images. The dreams
   * are readable long before that returns, so a signal that only fired at the very end
   * left the journal blank for the whole download — and made a pull-to-refresh, which
   * awaits the same cycle, look like it had done nothing.
   */
  describe('activity signalling', () => {
    it('announces that it has written the dreams before the image downloads start', async () => {
      const seenWhileHydrating: boolean[] = [];
      mockFrom.mockImplementation((table: string) => {
        if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
        return chainable(EMPTY);
      });
      // One image to hydrate, so the slow tail of the cycle is actually exercised.
      mockGetAllAsync.mockImplementation((sql: string) =>
        Promise.resolve(sql.includes('FROM media') ? [{ id: 'media-1' }] : [])
      );

      let notifications = 0;
      const unsubscribe = subscribeToPullActivity(() => {
        notifications += 1;
      });
      mediaCache.cacheMedia.mockImplementation(() => {
        // Whatever the list heard by now, it heard before this download began.
        seenWhileHydrating.push(notifications > 1);
        return Promise.resolve('/local/media/media-1.png');
      });

      await pullRemoteChanges('user-1', mediaCache);
      unsubscribe();

      expect(seenWhileHydrating).toEqual([true]);
    });

    it('reports itself in flight for the length of the cycle and settled after it', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      const inFlightDuringPull: boolean[] = [];
      mockGetAllAsync.mockImplementation(() => {
        inFlightDuringPull.push(isPullInFlight());
        return Promise.resolve([]);
      });

      expect(isPullInFlight()).toBe(false);
      await pullRemoteChanges('user-1');

      expect(inFlightDuringPull).toContain(true);
      expect(isPullInFlight()).toBe(false);
    });

    it('stays in flight until the last of two overlapping cycles settles', async () => {
      let releaseFirst: () => void = () => {};
      const firstPull = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      // Stall cycle one's very first step (the foreign-account scan, ahead of anything
      // that touches `mockFrom`) rather than a later one: once a newer cycle has
      // started, cycle one is superseded and returns right after this step without
      // ever reaching them — see `pullGeneration`.
      let notMineCalls = 0;
      mockGetAllAsync.mockImplementation((sql: string) => {
        if (!sql.includes('user_id != ?')) return Promise.resolve([]);
        notMineCalls += 1;
        return notMineCalls === 1 ? firstPull.then(() => []) : Promise.resolve([]);
      });
      mockFrom.mockImplementation(() => chainable(EMPTY));

      const first = pullRemoteChanges('user-1');
      await pullRemoteChanges('user-1');

      // The second cycle has settled, but the first has not — a shared boolean would
      // have reported "done" here and dropped the journal into its empty state.
      expect(isPullInFlight()).toBe(true);
      releaseFirst();
      await first;
      expect(isPullInFlight()).toBe(false);
    });

    it('lets a superseded cycle exit quietly rather than redo the newer cycle’s work', async () => {
      let releaseFirst: () => void = () => {};
      const firstPull = new Promise<void>(resolve => {
        releaseFirst = resolve;
      });
      let notMineCalls = 0;
      mockGetAllAsync.mockImplementation((sql: string) => {
        if (!sql.includes('user_id != ?')) return Promise.resolve([]);
        notMineCalls += 1;
        return notMineCalls === 1 ? firstPull.then(() => []) : Promise.resolve([]);
      });
      mockFrom.mockImplementation(() => chainable(EMPTY));

      const first = pullRemoteChanges('user-1');
      await pullRemoteChanges('user-1');
      const dreamsCallsFromSecondCycle = mockFrom.mock.calls.filter(
        ([table]) => table === 'dreams'
      ).length;

      releaseFirst();
      await first;

      // Cycle one contributed nothing once it noticed cycle two had already started —
      // it neither re-queried 'dreams' nor changed how many times cycle two did.
      expect(mockFrom.mock.calls.filter(([table]) => table === 'dreams').length).toBe(
        dreamsCallsFromSecondCycle
      );
    });

    it('settles even when a listener throws', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      const unsubscribe = subscribeToPullActivity(() => {
        throw new Error('a screen unmounted mid-notification');
      });

      await pullRemoteChanges('user-1');
      unsubscribe();

      expect(isPullInFlight()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'A pull-activity listener threw:',
        expect.any(Error)
      );
    });
  });

  describe('foreign-account cleanup', () => {
    /** Routes the two `getAllAsync` consumers apart: the cleanup's own "not mine" scan
     * and the recurrence rebuild / media hydration queries that follow it. */
    function foreignDreams(ids: string[]) {
      return (sql: string) =>
        Promise.resolve(sql.includes('user_id != ?') ? ids.map(id => ({ id })) : []);
    }

    it('purges the previous account’s dreams, and their cached images with them', async () => {
      mockGetAllAsync.mockImplementation(foreignDreams(['old-account-dream']));
      mockFrom.mockImplementation(() => chainable(EMPTY));

      await pullRemoteChanges('user-1', mediaCache);

      expect(mockPurgeDreamLocally).toHaveBeenCalledWith('old-account-dream', mediaCache);
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM recurrence_patterns'),
        'user-1'
      );
    });

    it('leaves the signed-in account’s own dreams untouched', async () => {
      mockGetAllAsync.mockImplementation(foreignDreams([]));
      mockFrom.mockImplementation(() => chainable(EMPTY));

      await pullRemoteChanges('user-1', mediaCache);

      expect(mockPurgeDreamLocally).not.toHaveBeenCalled();
    });

    // A sign-out immediately followed by a sign-in — exactly what testing account
    // deletion does — leaves the sign-out pull's scan still running under the *old*
    // userId. If it resumes after the sign-in pull has already synced the new
    // account's dreams down, those dreams are the only rows this scan finds, and
    // without the supersede guard they read as "belongs to someone else" and get
    // purged — permanently, since the dreams cursor never re-fetches a dream it
    // already applied once. This is what turned the orphan warning from transient
    // into one that repeats forever.
    it('does not purge the newly signed-in account’s dreams when a stale sign-out pull’s scan resolves late', async () => {
      let releaseStaleScan: () => void = () => {};
      const staleScanStalled = new Promise<void>(resolve => {
        releaseStaleScan = resolve;
      });
      let notMineCalls = 0;
      mockGetAllAsync.mockImplementation((sql: string) => {
        if (!sql.includes('user_id != ?')) return Promise.resolve([]);
        notMineCalls += 1;
        // The first "not mine" scan is the stale old-account pull's; hold it open. A
        // real race wouldn't need a second call to also be stalled — the new account's
        // own pull never sees this table as having anyone else's rows in it.
        return notMineCalls === 1
          ? staleScanStalled.then(() => [{ id: 'new-account-dream' }])
          : Promise.resolve([]);
      });
      mockFrom.mockImplementation(() => chainable(EMPTY));

      const staleSignOutPull = pullRemoteChanges('old-user', mediaCache);
      await pullRemoteChanges('new-user', mediaCache);

      releaseStaleScan();
      await staleSignOutPull;

      expect(mockPurgeDreamLocally).not.toHaveBeenCalledWith('new-account-dream', mediaCache);
    });
  });

  /**
   * A cursor is a high-water mark over one account's `last_modified_at` values. Shared
   * across accounts it read as "already pulled" for rows the second account had never
   * seen, so `gt(cursor)` matched nothing and the journal stayed permanently empty with
   * no way to refill it.
   */
  describe('per-account cursors', () => {
    it('starts a second account from the epoch rather than the first account’s cursor', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
        return chainable(EMPTY);
      });
      await pullRemoteChanges('user-1');
      expect(await AsyncStorage.getItem('sync_dreams_last_pulled_at:user-1')).toBe(
        baseRemoteDream.last_modified_at
      );

      const builders: Array<Record<string, jest.Mock>> = [];
      mockFrom.mockImplementation((table: string) => {
        const builder = chainable(EMPTY);
        if (table === 'dreams') builders.push(builder);
        return builder;
      });

      await pullRemoteChanges('user-2');

      expect(await AsyncStorage.getItem('sync_dreams_last_pulled_at:user-2')).toBeNull();
      expect(builders[0]!['gt']).toHaveBeenCalledWith(
        'last_modified_at',
        '1970-01-01T00:00:00.000Z'
      );
    });

    it('leaves the other account’s cursor intact when it advances its own', async () => {
      await AsyncStorage.setItem('sync_dreams_last_pulled_at:user-2', '2026-01-01T00:00:00.000Z');
      mockFrom.mockImplementation((table: string) => {
        if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
        return chainable(EMPTY);
      });

      await pullRemoteChanges('user-1');

      expect(await AsyncStorage.getItem('sync_dreams_last_pulled_at:user-2')).toBe(
        '2026-01-01T00:00:00.000Z'
      );
    });
  });

  describe('resetSyncCursors (repairs a dream the pre-guard supersede race purged for good)', () => {
    it('clears every cursor for the given account so the next pull is a full backfill', async () => {
      await AsyncStorage.setItem('sync_dreams_last_pulled_at:user-1', '2026-08-01T00:00:00.000Z');
      await AsyncStorage.setItem(
        'sync_interpretations_last_pulled_at:user-1',
        '2026-08-01T00:00:00.000Z'
      );
      await AsyncStorage.setItem('sync_media_last_pulled_at:user-1', '2026-08-01T00:00:00.000Z');
      await AsyncStorage.setItem(
        'sync_recurrence_folded_through:user-1',
        '2026-08-01T00:00:00.000Z'
      );

      await resetSyncCursors('user-1');

      expect(await AsyncStorage.getItem('sync_dreams_last_pulled_at:user-1')).toBeNull();
      expect(await AsyncStorage.getItem('sync_interpretations_last_pulled_at:user-1')).toBeNull();
      expect(await AsyncStorage.getItem('sync_media_last_pulled_at:user-1')).toBeNull();
      expect(await AsyncStorage.getItem('sync_recurrence_folded_through:user-1')).toBeNull();
    });

    it('leaves another account’s cursors alone', async () => {
      await AsyncStorage.setItem('sync_dreams_last_pulled_at:user-2', '2026-08-01T00:00:00.000Z');

      await resetSyncCursors('user-1');

      expect(await AsyncStorage.getItem('sync_dreams_last_pulled_at:user-2')).toBe(
        '2026-08-01T00:00:00.000Z'
      );
    });

    it('makes the next pull for the account do a full backfill from the epoch', async () => {
      await AsyncStorage.setItem('sync_dreams_last_pulled_at:user-1', '2026-08-01T00:00:00.000Z');
      await resetSyncCursors('user-1');

      const builders: Array<Record<string, jest.Mock>> = [];
      mockFrom.mockImplementation((table: string) => {
        const builder = chainable(EMPTY);
        if (table === 'dreams') builders.push(builder);
        return builder;
      });

      await pullRemoteChanges('user-1');

      expect(builders[0]!['gt']).toHaveBeenCalledWith(
        'last_modified_at',
        '1970-01-01T00:00:00.000Z'
      );
    });
  });

  it('skips a remote row that is older than the local one (last-write-wins protects an unpushed local edit)', async () => {
    const staleRemote = { ...baseRemoteDream, last_modified_at: '2026-08-01T00:00:00.000Z' };
    mockSelectWhere.mockResolvedValue([
      {
        id: 'dream-1',
        userId: 'user-1',
        description: 'A newer local edit not yet pushed.',
        occurredAt: '2026-08-01',
        emotions: '[]',
        isLucid: false,
        loggedAt: '2026-08-01T00:00:00.000Z',
        lastModifiedAt: '2026-08-03T00:00:00.000Z',
        isDeleted: false,
        editedSinceInterpretation: false,
        syncStatus: 'local',
      },
    ]);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [staleRemote], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    expect(mockRunAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dreams'),
      expect.anything()
    );
  });

  it('applies a remote row that is newer than the local one', async () => {
    mockSelectWhere.mockResolvedValue([
      {
        id: 'dream-1',
        userId: 'user-1',
        description: 'Old local copy.',
        occurredAt: '2026-08-01',
        emotions: '[]',
        isLucid: false,
        loggedAt: '2026-08-01T00:00:00.000Z',
        lastModifiedAt: '2026-08-01T00:00:00.000Z',
        isDeleted: false,
        editedSinceInterpretation: false,
        syncStatus: 'synced',
      },
    ]);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dreams'),
      expect.arrayContaining(['dream-1'])
    );
  });

  it('never names day_stress or presleep_substances, so a pull cannot reset the private local-only block', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    const call = mockRunAsync.mock.calls.find(c =>
      (c[0] as string).includes('INSERT INTO dreams')
    )!;
    const sql = call[0] as string;
    expect(sql).toContain('ON CONFLICT(id) DO UPDATE SET');
    expect(sql).not.toContain('day_stress');
    expect(sql).not.toContain('presleep_substances');
  });

  it('persists the cursor as the max last_modified_at seen after a page succeeds', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at:user-1')).resolves.toBe(
      baseRemoteDream.last_modified_at
    );
  });

  it('does not advance the cursor when applying a page throws partway through', async () => {
    // Targeted at the dream upsert rather than "the first runAsync": the cycle now opens
    // with the foreign-account cleanup, whose own DELETE would otherwise absorb this.
    mockRunAsync.mockImplementation((sql: string) =>
      sql.includes('INSERT INTO dreams')
        ? Promise.reject(new Error('disk full'))
        : Promise.resolve(undefined)
    );
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at:user-1')).resolves.toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Pull sync failed for dreams:', expect.any(Error));
  });

  it('loops to a second page when the first page comes back full, and stops once a page is short', async () => {
    const PAGE_SIZE = 200;
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ...baseRemoteDream,
      id: `dream-${i}`,
      last_modified_at: new Date(2026, 7, 1, 0, 0, i).toISOString(),
    }));
    const page2 = [
      { ...baseRemoteDream, id: 'dream-last', last_modified_at: '2026-09-01T00:00:00.000Z' },
    ];

    let dreamsCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'dreams') return chainable(EMPTY);
      dreamsCallCount += 1;
      return chainable({ data: dreamsCallCount === 1 ? page1 : page2, error: null });
    });

    await pullRemoteChanges('user-1');

    // page1 (full, PAGE_SIZE rows) -> page2 (short, stops the incremental loop) ->
    // one more 'dreams' call for the deletion-reconciliation query.
    expect(dreamsCallCount).toBe(3);
  });

  it('continues pulling interpretations and media even when the dreams pull fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: null, error: { message: 'boom' } });
      if (table === 'interpretations') {
        return chainable({
          data: [
            {
              id: 'interp-1',
              dream_id: 'dream-1',
              overall_reading: 'reading',
              keywords: ['a'],
              emotions: ['calm'],
              cultural_references: [],
              confidence: 'high',
              is_degraded: false,
              prompt_version: 'v1',
              model_used: 'claude',
              created_at: '2026-08-01T00:00:00.000Z',
            },
          ],
          error: null,
        });
      }
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
      expect.arrayContaining(['interp-1'])
    );
  });

  /**
   * `interpretations.dream_id` and `media.dream_id` are `NOT NULL REFERENCES dreams(id)`
   * with `PRAGMA foreign_keys = ON`, so a child row whose dream was deleted remotely
   * used to throw "FOREIGN KEY constraint failed" out of the entire pull — before the
   * cursor was written, so every later cycle refetched the same page and failed on the
   * same row. That stall is what left the journal list imageless: the media pull died
   * on one orphan and never inserted any of the rows behind it.
   */
  describe('a child row whose dream is not on this device', () => {
    const orphanInterpretation = {
      id: 'interp-orphan',
      dream_id: 'dream-deleted',
      overall_reading: 'reading',
      keywords: ['a'],
      emotions: ['calm'],
      cultural_references: [],
      confidence: 'high',
      is_degraded: false,
      prompt_version: 'v1',
      model_used: 'claude',
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const liveInterpretation = { ...orphanInterpretation, id: 'interp-1', dream_id: 'dream-1' };

    const orphanMedia = {
      id: 'media-orphan',
      dream_id: 'dream-deleted',
      media_type: 'image',
      generation_status: 'complete',
      storage_key: 'storage/media-orphan.png',
      regeneration_count: 0,
      max_regenerations: 3,
      error_message: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    };

    const liveMedia = { ...orphanMedia, id: 'media-1', dream_id: 'dream-1' };

    /** Only `dream-1` is on this device; `dream-deleted` is gone. */
    function onlyDreamOneIsLocal() {
      mockGetFirstAsync.mockImplementation((_sql: string, id: string) =>
        Promise.resolve(id === 'dream-1' ? { id } : null)
      );
    }

    it('skips the orphan interpretation and still applies the rows behind it', async () => {
      onlyDreamOneIsLocal();
      mockFrom.mockImplementation((table: string) => {
        if (table === 'interpretations')
          return chainable({ data: [orphanInterpretation, liveInterpretation], error: null });
        return chainable(EMPTY);
      });

      await pullRemoteChanges('user-1');

      expect(mockRunAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
        expect.arrayContaining(['interp-orphan'])
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
        expect.arrayContaining(['interp-1'])
      );
    });

    it('skips the orphan media row and still applies the rows behind it', async () => {
      onlyDreamOneIsLocal();
      mockFrom.mockImplementation((table: string) => {
        if (table === 'media') return chainable({ data: [orphanMedia, liveMedia], error: null });
        return chainable(EMPTY);
      });

      await pullRemoteChanges('user-1');

      expect(mockRunAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO media'),
        expect.arrayContaining(['media-orphan'])
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO media'),
        expect.arrayContaining(['media-1'])
      );
    });

    /**
     * An orphan is indistinguishable here from a dream that simply hasn't synced yet,
     * so the stored cursor stops at the last row actually applied. Advancing past the
     * skipped row would drop it on this device permanently.
     */
    it('does not advance the stored cursor past a skipped row', async () => {
      onlyDreamOneIsLocal();
      mockFrom.mockImplementation((table: string) => {
        if (table === 'interpretations')
          return chainable({
            data: [
              { ...liveInterpretation, created_at: '2026-08-01T00:00:00.000Z' },
              { ...orphanInterpretation, created_at: '2026-08-02T00:00:00.000Z' },
              { ...liveInterpretation, id: 'interp-2', created_at: '2026-08-03T00:00:00.000Z' },
            ],
            error: null,
          });
        return chainable(EMPTY);
      });

      await pullRemoteChanges('user-1');

      expect(await AsyncStorage.getItem('sync_interpretations_last_pulled_at:user-1')).toBe(
        '2026-08-01T00:00:00.000Z'
      );
    });

    it('names the skipped rows once rather than failing the pull', async () => {
      onlyDreamOneIsLocal();
      mockFrom.mockImplementation((table: string) => {
        if (table === 'interpretations')
          return chainable({ data: [orphanInterpretation], error: null });
        return chainable(EMPTY);
      });

      await expect(pullRemoteChanges('user-1')).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 interpretations whose dream is not on this device')
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    /**
     * The case that actually matters: a dream this device thinks it never has (it's
     * missing from SQLite, wherever that state came from — a version of this pull that
     * raced a sign-out/sign-in before `pullGeneration` existed, a dropped connection
     * mid-page) but that is still sitting on the server, untouched. Before this, the
     * only way back was a manual `resetSyncCursors` backfill; this is what makes that
     * unnecessary by fetching the one missing dream directly instead of waiting on a
     * cursor that will never revisit it.
     */
    it('recovers a dream missing only from this device by fetching it directly, rather than only skipping its children', async () => {
      mockGetFirstAsync.mockImplementation((_sql: string, id: string) =>
        Promise.resolve(id === 'dream-1' ? { id } : null)
      );
      const recoverable = { ...baseRemoteDream, id: 'dream-deleted', is_deleted: false };
      mockFrom.mockImplementation((table: string) => {
        if (table === 'interpretations')
          return chainable({ data: [orphanInterpretation, liveInterpretation], error: null });
        if (table === 'dreams') return chainable({ data: [recoverable], error: null });
        return chainable(EMPTY);
      });

      await pullRemoteChanges('user-1');

      // The dream itself lands locally...
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dreams'),
        expect.arrayContaining(['dream-deleted'])
      );
      // ...and its interpretation is no longer treated as an orphan.
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
        expect.arrayContaining(['interp-orphan'])
      );
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipped'));
    });

    it('still skips and warns when the point lookup finds the dream genuinely deleted', async () => {
      onlyDreamOneIsLocal();
      const deleted = { ...baseRemoteDream, id: 'dream-deleted', is_deleted: true };
      mockFrom.mockImplementation((table: string) => {
        if (table === 'interpretations')
          return chainable({ data: [orphanInterpretation], error: null });
        if (table === 'dreams') return chainable({ data: [deleted], error: null });
        return chainable(EMPTY);
      });

      await pullRemoteChanges('user-1');

      expect(mockRunAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
        expect.arrayContaining(['interp-orphan'])
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 interpretations whose dream is not on this device')
      );
    });

    it('falls back to skip-and-warn rather than crashing the page when the point lookup itself fails', async () => {
      onlyDreamOneIsLocal();
      mockFrom.mockImplementation((table: string) => {
        if (table === 'interpretations')
          return chainable({ data: [orphanInterpretation, liveInterpretation], error: null });
        if (table === 'dreams') return chainable({ data: null, error: { message: 'boom' } });
        return chainable(EMPTY);
      });

      await expect(pullRemoteChanges('user-1')).resolves.toBeUndefined();

      // The row behind the failed recovery attempt still goes through.
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
        expect.arrayContaining(['interp-1'])
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipped 1 interpretations whose dream is not on this device')
      );
    });
  });

  it('upserts media while preserving the existing local_cache_path (which has no remote counterpart)', async () => {
    mockSelectWhere.mockResolvedValue([
      {
        id: 'media-1',
        dreamId: 'dream-1',
        mediaType: 'image',
        generationStatus: 'pending',
        storageKey: null,
        localCachePath: '/local/cache/media-1.jpg',
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'media') {
        return chainable({
          data: [
            {
              id: 'media-1',
              dream_id: 'dream-1',
              media_type: 'image',
              generation_status: 'complete',
              storage_key: 'storage/media-1.png',
              regeneration_count: 0,
              max_regenerations: 3,
              error_message: null,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-02T00:00:00.000Z',
            },
          ],
          error: null,
        });
      }
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO media'),
      expect.arrayContaining(['media-1', '/local/cache/media-1.jpg'])
    );
  });

  describe('media cache invalidation (a regeneration keeps the row id and swaps the object)', () => {
    /** One local media row and the remote version of it, differing only in storage_key. */
    function stageMediaRow(localStorageKey: string | null, remoteStorageKey: string): void {
      mockSelectWhere.mockResolvedValue([
        {
          id: 'media-1',
          dreamId: 'dream-1',
          mediaType: 'image',
          generationStatus: 'complete',
          storageKey: localStorageKey,
          localCachePath: '/local/cache/media-1.jpg',
          regenerationCount: 0,
          maxRegenerations: 5,
          errorMessage: null,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ]);
      mockFrom.mockImplementation((table: string) => {
        if (table !== 'media') return chainable(EMPTY);
        return chainable({
          data: [
            {
              id: 'media-1',
              dream_id: 'dream-1',
              media_type: 'image',
              generation_status: 'complete',
              storage_key: remoteStorageKey,
              regeneration_count: 1,
              max_regenerations: 5,
              error_message: null,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-02T00:00:00.000Z',
            },
          ],
          error: null,
        });
      });
    }

    /** The `local_cache_path` binding is the 6th (0-indexed 5) in the INSERT statement. */
    function boundCachePath(): unknown {
      const call = mockRunAsync.mock.calls.find(c => String(c[0]).includes('INSERT INTO media'))!;
      return (call[1] as unknown[])[5];
    }

    // Without this the row keeps a path to the superseded image, hydration skips it
    // (it only fills null paths) and the device shows the old picture forever.
    it('drops the cached file and the path when the object behind the row changed', async () => {
      stageMediaRow('storage/image-1.png', 'storage/image-2.png');

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.removeCachedMedia).toHaveBeenCalledWith('media-1');
      expect(boundCachePath()).toBeNull();
    });

    // The generating device writes its own row through persistLocally, which has no
    // storage_key to write — so a null local key means "not seen yet", not "changed".
    // Treating it as a change would discard the file that generation just downloaded.
    it('leaves the cache alone when the local row simply never recorded a storage_key', async () => {
      stageMediaRow(null, 'storage/image-1.png');

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.removeCachedMedia).not.toHaveBeenCalled();
      expect(boundCachePath()).toBe('/local/cache/media-1.jpg');
    });

    it('leaves the cache alone when the object is unchanged', async () => {
      stageMediaRow('storage/image-1.png', 'storage/image-1.png');

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.removeCachedMedia).not.toHaveBeenCalled();
      expect(boundCachePath()).toBe('/local/cache/media-1.jpg');
    });

    // Clearing the path while the file is still on disk would be worse than keeping it:
    // cacheMedia short-circuits on an existing file and would re-record the stale image
    // as if it were fresh.
    it('keeps the stale path when the file could not be removed', async () => {
      stageMediaRow('storage/image-1.png', 'storage/image-2.png');
      mediaCache.removeCachedMedia.mockRejectedValueOnce(new Error('EBUSY'));

      await pullRemoteChanges('user-1', mediaCache);

      expect(boundCachePath()).toBe('/local/cache/media-1.jpg');
    });
  });

  it('refreshes the session and retries once when PostgREST rejects the token as issued in the future', async () => {
    let dreamsCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'dreams') return chainable(EMPTY);
      dreamsCallCount += 1;
      // The first attempt is rejected; everything after the refresh succeeds.
      return dreamsCallCount === 1
        ? chainable(STALE_SESSION)
        : chainable({ data: [baseRemoteDream], error: null });
    });

    await pullRemoteChanges('user-1');

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dreams'),
      expect.arrayContaining(['dream-1'])
    );
    // The retry ran to completion, so the cursor advanced rather than silently
    // staying put as it would have when the pull just returned on error.
    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at:user-1')).resolves.toBe(
      baseRemoteDream.last_modified_at
    );
  });

  it('also treats an expired-JWT rejection as a stale session, not a data error', async () => {
    // PGRST303 (clock skew) is covered above; PGRST301 is the far more common half of
    // the pair — an ordinary expired token — and shares none of its code path by luck.
    let calls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'dreams') return chainable(EMPTY);
      calls += 1;
      return calls === 1
        ? chainable({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
        : chainable({ data: [baseRemoteDream], error: null });
    });

    await pullRemoteChanges('user-1');

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at:user-1')).resolves.toBe(
      baseRemoteDream.last_modified_at
    );
  });

  it('refreshes on a stale session reported by the interpretations pull, not just dreams', async () => {
    // Each pull calls assertSessionUsable separately, so covering one says nothing
    // about the others — and a token that expires mid-cycle hits a later table first.
    let calls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'interpretations') return chainable(EMPTY);
      calls += 1;
      // No `message`, exercising the 'no detail' fallback in the thrown error.
      return calls === 1
        ? chainable({ data: null, error: { code: 'PGRST301' } })
        : chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('no detail'));
  });

  it('defaults a null themes array rather than writing SQL NULL into a NOT NULL column', async () => {
    // `themes` is NOT NULL DEFAULT '[]' locally, but an interpretation written before
    // migration 016 comes back from PostgREST with all three new columns null.
    const preMigrationRow = {
      id: 'interp-1',
      dream_id: 'dream-1',
      overall_reading: 'A reading from before the archetype columns existed.',
      keywords: ['water'],
      emotions: ['calm'],
      cultural_references: [],
      confidence: 0.8,
      is_degraded: false,
      prompt_version: 'v1',
      model_used: 'claude-haiku-4-5',
      created_at: '2026-08-02T00:00:00.000Z',
      archetype: null,
      themes: null,
      symbolic_density: null,
    };
    mockFrom.mockImplementation((table: string) =>
      table === 'interpretations'
        ? chainable({ data: [preMigrationRow], error: null })
        : chainable(EMPTY)
    );

    await pullRemoteChanges('user-1');

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO interpretations'),
      expect.arrayContaining(['interp-1', null, '[]', null])
    );
  });

  it('does not refresh the session for a data-layer error, which the next cycle can simply retry', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'dreams'
        ? chainable({ data: null, error: { code: '42703', message: 'column does not exist' } })
        : chainable(EMPTY)
    );

    await pullRemoteChanges('user-1');

    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Pull dreams failed:',
      expect.objectContaining({ code: '42703' })
    );
  });

  it('leaves the pull for the next sync cycle when the session refresh itself fails', async () => {
    mockRefreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'network down' },
    });
    let dreamsCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'dreams') return chainable(EMPTY);
      dreamsCallCount += 1;
      return chainable(STALE_SESSION);
    });

    await pullRemoteChanges('user-1');

    // One rejected attempt each for the incremental pull and the deletion
    // reconciliation, and no retry behind either — the refresh never succeeded.
    expect(dreamsCallCount).toBe(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Session refresh failed, leaving dreams for the next sync:',
      expect.objectContaining({ message: 'network down' })
    );
  });

  it('retries a stale session only once, leaving a still-failing pull to the next cycle', async () => {
    let dreamsCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'dreams') return chainable(EMPTY);
      dreamsCallCount += 1;
      return chainable(STALE_SESSION);
    });

    await pullRemoteChanges('user-1');

    // dreams: initial + one retry. Deletion reconciliation: initial + one retry.
    // Nothing loops beyond that even though every attempt keeps failing.
    expect(dreamsCallCount).toBe(4);
    expect(mockRefreshSession).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Pull sync failed for dreams even after a session refresh:',
      expect.any(Error)
    );
  });

  /**
   * The constellation reads `recurrence_patterns`, which only ever got written by the
   * screen that ran an interpretation. A device that pulled those interpretations from
   * elsewhere had an empty table and was told it had "not enough dreams yet", however
   * full its journal was.
   */
  describe('rebuilding recurrence patterns from the interpretations on this device', () => {
    const interpretationRow = {
      dream_id: 'dream-1',
      keywords: '["ocean","flight"]',
      emotions: '["awe"]',
      themes: '["freedom"]',
      created_at: '2026-08-01T00:00:00.000Z',
    };

    /** getAllAsync serves both the recurrence rebuild and the media hydration; only
     * the rebuild's query names `FROM interpretations`. */
    function respondToRebuildWith(rows: unknown[]) {
      mockGetAllAsync.mockImplementation((sql: string) =>
        Promise.resolve(sql.includes('FROM interpretations') ? rows : [])
      );
    }

    it('records keywords, emotions and themes for a synced interpretation', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      respondToRebuildWith([interpretationRow]);

      await pullRemoteChanges('user-1');

      expect(mockRecordRecurrence).toHaveBeenCalledWith(
        'user-1',
        'dream-1',
        'keyword',
        ['ocean', 'flight'],
        '2026-08-01T00:00:00.000Z'
      );
      expect(mockRecordRecurrence).toHaveBeenCalledWith(
        'user-1',
        'dream-1',
        'emotion',
        ['awe'],
        '2026-08-01T00:00:00.000Z'
      );
      expect(mockRecordRecurrence).toHaveBeenCalledWith(
        'user-1',
        'dream-1',
        'theme',
        ['freedom'],
        '2026-08-01T00:00:00.000Z'
      );
    });

    /** `getTopRecurrences` filters on `last_seen_at`, so stamping a backfill with the
     * current time would make every old symbol look like it recurred today. */
    it("stamps each pattern with the interpretation's own timestamp, not now", async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      respondToRebuildWith([interpretationRow]);

      await pullRemoteChanges('user-1');

      for (const call of mockRecordRecurrence.mock.calls) {
        expect(call[4]).toBe('2026-08-01T00:00:00.000Z');
      }
    });

    it('folds each interpretation once, resuming from its stored cursor', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      respondToRebuildWith([interpretationRow]);

      await pullRemoteChanges('user-1');

      expect(await AsyncStorage.getItem('sync_recurrence_folded_through:user-1')).toBe(
        '2026-08-01T00:00:00.000Z'
      );
      const [sql, bindings] = mockGetAllAsync.mock.calls.find(([q]) =>
        (q as string).includes('FROM interpretations')
      ) as [string, string[]];
      expect(sql).toContain('i.created_at > ?');
      expect(bindings[0]).toBe('1970-01-01T00:00:00.000Z');
    });

    it('costs a dream its stars rather than the whole rebuild when a term list is malformed', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      respondToRebuildWith([
        { ...interpretationRow, keywords: 'not json at all' },
        {
          dream_id: 'dream-2',
          keywords: '["forest"]',
          emotions: '[]',
          themes: '[]',
          created_at: '2026-08-02T00:00:00.000Z',
        },
      ]);

      await pullRemoteChanges('user-1');

      expect(mockRecordRecurrence).toHaveBeenCalledWith(
        'user-1',
        'dream-1',
        'keyword',
        [],
        expect.any(String)
      );
      expect(mockRecordRecurrence).toHaveBeenCalledWith(
        'user-1',
        'dream-2',
        'keyword',
        ['forest'],
        expect.any(String)
      );
    });
  });

  describe('media cache hydration (an image generated on another device has no local file)', () => {
    it('downloads a synced image that has no cached file and records the local path', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }]);

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.getSignedUrl).toHaveBeenCalledWith('media-1');
      expect(mediaCache.cacheMedia).toHaveBeenCalledWith(
        'media-1',
        'https://example.com/signed.png'
      );
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media SET local_cache_path'),
        ['/local/media/media-1.png', 'media-1']
      );
    });

    /** The one `getAllAsync` call that is the media-hydration query. */
    function hydrationQuery(): string {
      const call = mockGetAllAsync.mock.calls.find(([sql]) =>
        (sql as string).includes('FROM media')
      );
      if (!call) throw new Error('hydration never queried media');
      return call[0] as string;
    }

    it('only considers completed images that have a remote object', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));

      await pullRemoteChanges('user-1', mediaCache);

      // The recurrence rebuild also reads through getAllAsync, so pick the hydration
      // query by what it selects rather than by call order.
      const sql = hydrationQuery();
      expect(sql).toContain("generation_status = 'complete'");
      expect(sql).toContain('storage_key IS NOT NULL');
      // Deliberately *not* filtered on `local_cache_path IS NULL`: a recorded path
      // can outlive the file it names, and those are the rows needing repair.
      expect(sql).not.toContain('local_cache_path IS NULL');
    });

    it('leaves an already-cached image alone instead of downloading it again', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }]);
      mediaCache.isCached.mockResolvedValue(true);

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.getSignedUrl).not.toHaveBeenCalled();
      expect(mediaCache.cacheMedia).not.toHaveBeenCalled();
    });

    it('re-downloads a row whose recorded file is gone — a purged cache or a reinstall', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      // The row still carries a `local_cache_path`; only the file behind it vanished.
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }]);
      mediaCache.isCached.mockResolvedValue(false);

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.getSignedUrl).toHaveBeenCalledWith('media-1');
      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media SET local_cache_path'),
        ['/local/media/media-1.png', 'media-1']
      );
    });

    it('keeps caching the rest of the batch when one image cannot be downloaded', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);
      mediaCache.getSignedUrl.mockRejectedValueOnce(new Error('object missing'));

      await pullRemoteChanges('user-1', mediaCache);

      // media-1 failed, but media-2 was still fetched and written.
      expect(mediaCache.cacheMedia).toHaveBeenCalledTimes(1);
      expect(mediaCache.cacheMedia).toHaveBeenCalledWith(
        'media-2',
        'https://example.com/signed.png'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to cache media media-1:',
        expect.any(Error)
      );
    });

    it('leaves the cache path null so a failed download is retried on the next cycle', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      mockGetAllAsync.mockResolvedValue([{ id: 'media-1' }]);
      mediaCache.cacheMedia.mockRejectedValueOnce(new Error('disk full'));

      await pullRemoteChanges('user-1', mediaCache);

      expect(mockRunAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media SET local_cache_path'),
        expect.anything()
      );
    });

    // The limit bounds downloads, not rows examined. Capping the query instead would
    // let a wall of already-cached recent images hide an older broken one forever.
    it('repairs an older image even when more recent ones fill the download budget', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      const ids = Array.from({ length: 40 }, (_, i) => ({ id: `media-${i}` }));
      mockGetAllAsync.mockResolvedValue(ids);
      // Everything recent is present; only the very last row lost its file.
      mediaCache.isCached.mockImplementation(async (id: string) => id !== 'media-39');

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.getSignedUrl).toHaveBeenCalledTimes(1);
      expect(mediaCache.getSignedUrl).toHaveBeenCalledWith('media-39');
    });

    it('stops after the download budget so one sync cannot pull an entire library', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));
      mockGetAllAsync.mockResolvedValue(
        Array.from({ length: 40 }, (_, i) => ({ id: `media-${i}` }))
      );
      mediaCache.isCached.mockResolvedValue(false);

      await pullRemoteChanges('user-1', mediaCache);

      expect(mediaCache.cacheMedia).toHaveBeenCalledTimes(24);
    });

    it('skips hydration entirely when no media cache is supplied', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));

      await pullRemoteChanges('user-1');

      expect(
        mockGetAllAsync.mock.calls.some(([sql]) => (sql as string).includes('FROM media'))
      ).toBe(false);
      expect(mediaCache.getSignedUrl).not.toHaveBeenCalled();
    });
  });
});
