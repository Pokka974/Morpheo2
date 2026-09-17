// Behavioral tests for the account-delete Edge Function: the handler registered by `serve()`
// is invoked directly against a scripted fake Supabase client (see ../_harness/), so these
// assert the actual request/response/DB-write behavior. account-delete.test.ts's source-text
// guards stay in place as regression guards for the two bugs that motivated them (a
// non-JWT sign-out argument, a swallowed schedule failure) — this file is the integration
// layer those guards were never meant to be.
import { loadEdgeFunctionHandler } from './_harness/loadEdgeFunctionHandler';
import { __setSupabaseScript } from './_harness/supabaseJsShim';
import type { SupabaseScript } from './_harness/fakeSupabaseClient';

const USER_ID = 'user-123';
const ACCESS_TOKEN = 'a-valid-access-token';

function request(body: unknown, authHeader: string | null = `Bearer ${ACCESS_TOKEN}`): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader !== null) headers['Authorization'] = authHeader;
  return new Request('https://example.com/account-delete', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function baseScript(overrides: Partial<SupabaseScript> = {}): SupabaseScript {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
      adminSignOut: jest.fn().mockResolvedValue({ error: null }),
      ...overrides.auth,
    },
    tables: {
      profiles: [{ data: null, error: null }],
      ...overrides.tables,
    },
    rpc: { ...overrides.rpc },
  };
}

describe('account-delete Edge Function behavior', () => {
  let handler: ReturnType<typeof loadEdgeFunctionHandler>;

  beforeAll(() => {
    handler = loadEdgeFunctionHandler('account-delete');
  });

  it('returns 401 when no Authorization header is sent', async () => {
    __setSupabaseScript(baseScript());
    const res = await handler(request({ confirmation: 'DELETE MY ACCOUNT' }, null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 when the caller is not a recognized user', async () => {
    __setSupabaseScript(
      baseScript({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      })
    );
    const res = await handler(request({ confirmation: 'DELETE MY ACCOUNT' }));
    expect(res.status).toBe(401);
  });

  it('rejects a confirmation phrase that does not match exactly', async () => {
    __setSupabaseScript(baseScript());
    const res = await handler(request({ confirmation: 'delete my account' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_confirmation' });
  });

  it('schedules the deletion, signs out with the caller token (not the user id), and returns 200', async () => {
    const adminSignOut = jest.fn().mockResolvedValue({ error: null });
    __setSupabaseScript(baseScript({ auth: { adminSignOut } }));

    const res = await handler(request({ confirmation: 'DELETE MY ACCOUNT' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scheduled: boolean; deletionDate: string };
    expect(body.scheduled).toBe(true);
    expect(new Date(body.deletionDate).getTime()).toBeGreaterThan(Date.now());

    // The regression this guards: `admin.signOut` authenticates with whatever it is handed —
    // passing `user.id` here sent a bare UUID as a bearer token and GoTrue rejected every
    // deletion's sign-out silently. This must be the caller's own access token, not the id.
    expect(adminSignOut).toHaveBeenCalledWith(ACCESS_TOKEN, 'global');
  });

  it('returns 500 and never calls admin.signOut when the schedule write fails', async () => {
    const adminSignOut = jest.fn().mockResolvedValue({ error: null });
    __setSupabaseScript(
      baseScript({
        tables: { profiles: [{ data: null, error: { message: 'db down' } }] },
        auth: { adminSignOut },
      })
    );

    const res = await handler(request({ confirmation: 'DELETE MY ACCOUNT' }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'schedule_failed' });
    // The write has to land before anyone is signed out — a signed-out user cannot retry.
    expect(adminSignOut).not.toHaveBeenCalled();
  });

  it('still returns 200 when the sign-out itself fails, since deletion is already recorded', async () => {
    __setSupabaseScript(
      baseScript({
        auth: { adminSignOut: jest.fn().mockResolvedValue({ error: { message: 'gone' } }) },
      })
    );

    const res = await handler(request({ confirmation: 'DELETE MY ACCOUNT' }));

    expect(res.status).toBe(200);
    expect((await res.json()).scheduled).toBe(true);
  });
});
