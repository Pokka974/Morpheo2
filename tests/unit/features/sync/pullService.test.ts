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
  },
}));

import { pullRemoteChanges } from '@features/sync/pullService';

/** Builds a chainable query-builder stub matching how pullService calls the
 * Supabase client. Most queries end in an explicit `.limit()`; the deletion
 * reconciliation query doesn't call `.limit()` at all and instead awaits the
 * builder directly (real supabase-js query builders are themselves thenable), so
 * this stub supports both terminal styles. */
function chainable(result: { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'gt', 'order']) {
    builder[method] = jest.fn(() => builder);
  }
  builder['limit'] = jest.fn(() => Promise.resolve(result));
  builder['then'] = jest.fn((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  );
  return builder;
}

const EMPTY = { data: [], error: null };

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
};

describe('pullRemoteChanges', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockFrom.mockReset();
    mockSelectWhere.mockReset().mockResolvedValue([]);
    mockRunAsync.mockReset().mockResolvedValue(undefined);
    mockGetAllAsync.mockReset().mockResolvedValue([]);
    mediaCache.getSignedUrl.mockReset().mockResolvedValue('https://example.com/signed.png');
    mediaCache.cacheMedia.mockReset().mockResolvedValue('/local/media/media-1.png');
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

  it('mirrors a remote deletion as a local soft-delete, matching the app-wide is_deleted pattern', async () => {
    const deleted = { ...baseRemoteDream, id: 'dream-deleted', is_deleted: true };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [deleted], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO dreams'),
      expect.arrayContaining(['dream-deleted'])
    );
    const call = mockRunAsync.mock.calls.find(c => (c[1] as unknown[]).includes('dream-deleted'))!;
    const bindings = call[1] as unknown[];
    // is_deleted is the 9th bound parameter (0-indexed 8) in the INSERT statement.
    expect(bindings[8]).toBe(1);
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

    it('marks a synced local dream deleted when it is absent from the remote active set', async () => {
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

      await pullRemoteChanges('user-1');

      expect(mockRunAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE dreams SET is_deleted = 1 WHERE id = ?'),
        'dream-1'
      );
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

      await pullRemoteChanges('user-1');

      expect(mockRunAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE dreams SET is_deleted = 1 WHERE id = ?'),
        expect.anything()
      );
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

    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at')).resolves.toBe(
      baseRemoteDream.last_modified_at
    );
  });

  it('does not advance the cursor when applying a page throws partway through', async () => {
    mockRunAsync.mockRejectedValueOnce(new Error('disk full'));
    mockFrom.mockImplementation((table: string) => {
      if (table === 'dreams') return chainable({ data: [baseRemoteDream], error: null });
      return chainable(EMPTY);
    });

    await pullRemoteChanges('user-1');

    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at')).resolves.toBeNull();
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
    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at')).resolves.toBe(
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
    await expect(AsyncStorage.getItem('sync_dreams_last_pulled_at')).resolves.toBe(
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

    it('only considers completed images that have a remote object but no local file', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));

      await pullRemoteChanges('user-1', mediaCache);

      const [sql] = mockGetAllAsync.mock.calls[0] as [string, number];
      expect(sql).toContain("generation_status = 'complete'");
      expect(sql).toContain('storage_key IS NOT NULL');
      expect(sql).toContain('local_cache_path IS NULL');
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

    it('skips hydration entirely when no media cache is supplied', async () => {
      mockFrom.mockImplementation(() => chainable(EMPTY));

      await pullRemoteChanges('user-1');

      expect(mockGetAllAsync).not.toHaveBeenCalled();
      expect(mediaCache.getSignedUrl).not.toHaveBeenCalled();
    });
  });
});
