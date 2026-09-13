// A minimal, scripted stand-in for the `@supabase/supabase-js` client, built for the query
// shapes the Edge Functions actually use rather than the whole real API surface.
//
// `.from(table)` responses are scripted as a FIFO queue per table: each test lists the
// responses in the same order its target function calls `.from(table)` for a request, which
// keeps the script readable as a plain description of "what the database said, in order"
// rather than a pattern-matcher over query shapes.
export type TableResponse<T = unknown> = { data: T | null; error: unknown };

type StorageBucketOverrides = Partial<{
  upload: jest.Mock;
  remove: jest.Mock;
  createSignedUrl: jest.Mock;
}>;

export interface SupabaseScript {
  auth?: { getUser?: jest.Mock; adminSignOut?: jest.Mock };
  rpc?: Record<string, jest.Mock>;
  tables?: Record<string, TableResponse[]>;
  storage?: Record<string, StorageBucketOverrides>;
}

/**
 * Thenable at every step of the chain, matching the real query builder: some call sites
 * terminate with `.single()`/`.maybeSingle()`, others just `await` the builder directly
 * (e.g. a bare `.update().eq()`), and both must resolve the same scripted response.
 */
class FakeQueryBuilder<T = unknown> implements PromiseLike<TableResponse<T>> {
  constructor(private readonly resolveNext: () => TableResponse<T>) {}

  select() {
    return this;
  }
  eq() {
    return this;
  }
  neq() {
    return this;
  }
  not() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  in() {
    return this;
  }
  update() {
    return this;
  }
  insert() {
    return this;
  }
  delete() {
    return this;
  }
  upsert() {
    return this;
  }

  single() {
    return Promise.resolve(this.resolveNext());
  }

  maybeSingle() {
    return Promise.resolve(this.resolveNext());
  }

  then<TResult1 = TableResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: TableResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolveNext()).then(onfulfilled, onrejected);
  }
}

function defaultStorageMethods(overrides: StorageBucketOverrides | undefined) {
  return {
    upload: overrides?.upload ?? jest.fn().mockResolvedValue({ data: {}, error: null }),
    remove: overrides?.remove ?? jest.fn().mockResolvedValue({ data: {}, error: null }),
    createSignedUrl:
      overrides?.createSignedUrl ??
      jest
        .fn()
        .mockResolvedValue({ data: { signedUrl: 'https://signed.example/test' }, error: null }),
  };
}

export function createFakeSupabaseClient(script: SupabaseScript) {
  const tableQueues: Record<string, TableResponse[]> = {};
  for (const [table, queue] of Object.entries(script.tables ?? {})) {
    tableQueues[table] = [...queue];
  }
  const storageBuckets: Record<string, ReturnType<typeof defaultStorageMethods>> = {};

  return {
    auth: {
      getUser:
        script.auth?.getUser ??
        jest.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('fakeSupabaseClient: auth.getUser was not scripted for this test'),
        }),
      admin: {
        signOut: script.auth?.adminSignOut ?? jest.fn().mockResolvedValue({ error: null }),
      },
    },
    rpc(name: string, args?: unknown) {
      const fn = script.rpc?.[name];
      if (!fn) {
        throw new Error(`fakeSupabaseClient: no scripted rpc handler for "${name}"`);
      }
      return fn(args);
    },
    from(table: string) {
      const resolveNext = (): TableResponse => {
        const queue = tableQueues[table];
        if (!queue || queue.length === 0) {
          throw new Error(
            `fakeSupabaseClient: no scripted response left for table "${table}" — ` +
              'add one more entry to the script in call order.'
          );
        }
        return queue.shift()!;
      };
      return new FakeQueryBuilder(resolveNext);
    },
    storage: {
      from(bucket: string) {
        if (!storageBuckets[bucket]) {
          storageBuckets[bucket] = defaultStorageMethods(script.storage?.[bucket]);
        }
        return storageBuckets[bucket];
      },
    },
  };
}
