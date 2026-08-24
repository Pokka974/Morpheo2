import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockFrom = jest.fn();
// Mock supabase client before import to avoid env var validation throwing — same
// resolved module (`src/supabase/client`) as syncService.test.ts mocks.
jest.mock('@features/../supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const mockSelectWhere = jest.fn();
const mockRunAsync = jest.fn();
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
};

describe('pullRemoteChanges', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockFrom.mockReset();
    mockSelectWhere.mockReset().mockResolvedValue([]);
    mockRunAsync.mockReset().mockResolvedValue(undefined);
    await AsyncStorage.clear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
      expect.stringContaining('INSERT OR REPLACE INTO dreams'),
      expect.arrayContaining(['dream-deleted'])
    );
    const call = mockRunAsync.mock.calls.find(c => (c[1] as unknown[]).includes('dream-deleted'))!;
    const bindings = call[1] as unknown[];
    // is_deleted is the 9th bound parameter (0-indexed 8) in the INSERT OR REPLACE statement.
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
      expect.stringContaining('INSERT OR REPLACE INTO dreams'),
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
      expect.stringContaining('INSERT OR REPLACE INTO dreams'),
      expect.arrayContaining(['dream-1'])
    );
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
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Pull sync failed for dreams:',
      expect.any(Error)
    );
  });

  it('loops to a second page when the first page comes back full, and stops once a page is short', async () => {
    const PAGE_SIZE = 200;
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ...baseRemoteDream,
      id: `dream-${i}`,
      last_modified_at: new Date(2026, 7, 1, 0, 0, i).toISOString(),
    }));
    const page2 = [{ ...baseRemoteDream, id: 'dream-last', last_modified_at: '2026-09-01T00:00:00.000Z' }];

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
});
