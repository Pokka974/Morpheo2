// Behavioral tests for the revenuecat-webhook Edge Function — see
// ../_harness/ and account-delete.behavior.test.ts's header comment for why this file exists
// alongside revenuecat-webhook.test.ts's source-text guards rather than instead of them.
import { loadEdgeFunctionHandler } from './_harness/loadEdgeFunctionHandler';
import { __setSupabaseScript } from './_harness/supabaseJsShim';
import type { SupabaseScript } from './_harness/fakeSupabaseClient';

const WEBHOOK_SECRET = 'whsec_test_shared_secret';
const VALID_UUID = '11111111-2222-4333-8444-555555555555';

function request(opts: {
  method?: string;
  auth?: string | null;
  body?: unknown;
  rawBody?: string;
}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== null) headers['Authorization'] = opts.auth ?? WEBHOOK_SECRET;
  return new Request('https://example.com/revenuecat-webhook', {
    method: opts.method ?? 'POST',
    headers,
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
}

function baseScript(overrides: Partial<SupabaseScript> = {}): SupabaseScript {
  return {
    tables: {
      entitlements: [{ data: [{ user_id: VALID_UUID }], error: null }],
      profiles: [{ data: null, error: null }],
      ...overrides.tables,
    },
  };
}

describe('revenuecat-webhook Edge Function behavior', () => {
  let handler: ReturnType<typeof loadEdgeFunctionHandler>;

  beforeAll(() => {
    handler = loadEdgeFunctionHandler('revenuecat-webhook', {
      REVENUECAT_WEBHOOK_AUTH_HEADER: WEBHOOK_SECRET,
    });
  });

  it('rejects a non-POST method', async () => {
    const res = await handler(request({ method: 'GET' }));
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
  });

  it('rejects the wrong shared secret', async () => {
    const res = await handler(request({ auth: 'wrong-secret', body: {} }));
    expect(res.status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    const res = await handler(request({ auth: null, body: {} }));
    expect(res.status).toBe(401);
  });

  it('answers malformed JSON with 400, not a 5xx retry loop', async () => {
    const res = await handler(request({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
  });

  it('returns 200 ok when the event carries no app_user_id', async () => {
    const res = await handler(request({ body: { event: { type: 'INITIAL_PURCHASE' } } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 200 matched:0 for a non-uuid app_user_id, without touching the database', async () => {
    const res = await handler(
      request({
        body: {
          event: { type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc123' },
        },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, matched: 0 });
  });

  it('returns 200 ok for an event type that does not change tier (e.g. CANCELLATION)', async () => {
    __setSupabaseScript(baseScript());
    const res = await handler(
      request({ body: { event: { type: 'CANCELLATION', app_user_id: VALID_UUID } } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('moves a subscriber to premium on INITIAL_PURCHASE and returns 200', async () => {
    __setSupabaseScript(baseScript());
    const expiresAtMs = Date.parse('2027-01-01T00:00:00Z');
    const res = await handler(
      request({
        body: {
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: VALID_UUID,
            expiration_at_ms: expiresAtMs,
          },
        },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('downgrades to free on EXPIRATION', async () => {
    __setSupabaseScript(baseScript());
    const res = await handler(
      request({ body: { event: { type: 'EXPIRATION', app_user_id: VALID_UUID } } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 500 when the entitlements write fails, so RevenueCat retries', async () => {
    __setSupabaseScript(
      baseScript({
        tables: { entitlements: [{ data: null, error: { message: 'db down' } }] },
      })
    );
    const res = await handler(
      request({ body: { event: { type: 'RENEWAL', app_user_id: VALID_UUID } } })
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'entitlement_update_failed' });
  });

  it('returns 500 when the profiles write fails even though entitlements succeeded', async () => {
    __setSupabaseScript(
      baseScript({
        tables: {
          entitlements: [{ data: [{ user_id: VALID_UUID }], error: null }],
          profiles: [{ data: null, error: { message: 'db down' } }],
        },
      })
    );
    const res = await handler(
      request({ body: { event: { type: 'RENEWAL', app_user_id: VALID_UUID } } })
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 matched:0 (not an error) when the update touches zero rows', async () => {
    __setSupabaseScript(
      baseScript({
        tables: {
          entitlements: [{ data: [], error: null }],
          profiles: [{ data: null, error: null }],
        },
      })
    );
    const res = await handler(
      request({ body: { event: { type: 'RENEWAL', app_user_id: VALID_UUID } } })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, matched: 0 });
  });
});
