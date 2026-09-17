// Behavioral tests for the generate-image Edge Function — see ../_harness/ and
// account-delete.behavior.test.ts's header comment for why this file exists alongside
// generate-image.test.ts's source-text guards rather than instead of them.
//
// Flux is called through the real global `fetch` (not the Supabase client), so these mock
// `global.fetch` directly for the submit → poll → download sequence.
import { loadEdgeFunctionHandler } from './_harness/loadEdgeFunctionHandler';
import { __setSupabaseScript } from './_harness/supabaseJsShim';
import { __setAnthropicScript } from './_harness/anthropicSdkShim';
import type { SupabaseScript } from './_harness/fakeSupabaseClient';

const USER_ID = 'user-123';
const DREAM_ID = 'dream-456';

function request(body: unknown, authHeader: string | null = 'Bearer a-valid-jwt'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader !== null) headers['Authorization'] = authHeader;
  return new Request('https://example.com/generate-image', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function scriptOpenScreen() {
  return {
    screen_text: jest.fn().mockResolvedValue({
      content: [{ type: 'tool_use', input: { blocked: false } }],
    }),
  };
}

function scriptBlockedScreen() {
  return {
    screen_text: jest.fn().mockResolvedValue({
      content: [{ type: 'tool_use', input: { blocked: true } }],
    }),
  };
}

function baseSupabaseScript(overrides: Partial<SupabaseScript> = {}): SupabaseScript {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
      ...overrides.auth,
    },
    tables: {
      media: [{ data: null, error: null }],
      interpretations: [{ data: null, error: null }],
      system_prompts: [{ data: { image_prompt_directive: 'House style directive.' }, error: null }],
      ...overrides.tables,
    },
    rpc: {
      consume_image_credit: jest.fn().mockResolvedValue({ data: 'monthly', error: null }),
      refund_image_credit: jest.fn().mockResolvedValue({ data: null, error: null }),
      ...overrides.rpc,
    },
    storage: { 'dream-media': {}, ...overrides.storage },
  };
}

/** The three real `fetch` calls a successful generation makes, in order: submit, one poll, download. */
function mockFluxHappyPath(): jest.Mock {
  const fetchMock = jest.fn();
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ polling_url: 'https://api.bfl.ai/poll/abc' }))
    .mockResolvedValueOnce(
      jsonResponse({ status: 'Ready', result: { sample: 'https://signed.bfl.ai/result.png' } })
    )
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }));
  return fetchMock;
}

describe('generate-image Edge Function behavior', () => {
  let handler: ReturnType<typeof loadEdgeFunctionHandler>;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    handler = loadEdgeFunctionHandler('generate-image');
  });

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 401 with no Authorization header', async () => {
    // Like interpret, the Supabase client is created before the header check runs.
    __setSupabaseScript(baseSupabaseScript());
    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }, null));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    __setSupabaseScript(baseSupabaseScript());
    const res = await handler(request({ dreamId: DREAM_ID }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing_fields' });
  });

  it('blocks unsafe dream text before spending a credit or calling Flux', async () => {
    const consumeCredit = jest.fn();
    __setSupabaseScript(
      baseSupabaseScript({
        rpc: { consume_image_credit: consumeCredit },
        tables: {
          media: [
            { data: null, error: null }, // existing-media lookup: none yet
            { data: null, error: null }, // markSafetyBlocked's insert (no existing row)
          ],
        },
      })
    );
    __setAnthropicScript(scriptBlockedScreen());
    global.fetch = jest.fn();

    const res = await handler(request({ dreamId: DREAM_ID, description: 'unsafe text' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'safety_blocked' });
    expect(consumeCredit).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 429 with a resetDate when the image credit is denied', async () => {
    __setSupabaseScript(
      baseSupabaseScript({
        rpc: { consume_image_credit: jest.fn().mockResolvedValue({ data: 'denied', error: null }) },
      })
    );
    __setAnthropicScript(scriptOpenScreen());

    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; resetDate: string };
    expect(body.error).toBe('limit_reached');
    expect(new Date(body.resetDate).getTime()).toBeGreaterThan(Date.now());
  });

  it('generates and stores a new image end to end, spending the credit and never refunding it', async () => {
    const consumeCredit = jest.fn().mockResolvedValue({ data: 'monthly', error: null });
    const refundCredit = jest.fn();
    const upload = jest.fn().mockResolvedValue({ data: {}, error: null });
    __setSupabaseScript(
      baseSupabaseScript({
        rpc: { consume_image_credit: consumeCredit, refund_image_credit: refundCredit },
        tables: {
          media: [
            { data: null, error: null }, // existing-media lookup: none yet
            {
              data: { id: 'media-1', dream_id: DREAM_ID, created_at: 'now', updated_at: 'now' },
              error: null,
            }, // insert().select().single()
            { data: [], error: null }, // superseded-siblings lookup: none
          ],
          interpretations: [{ data: null, error: null }],
        },
        storage: { 'dream-media': { upload } },
      })
    );
    __setAnthropicScript(scriptOpenScreen());
    global.fetch = mockFluxHappyPath();

    const res = await handler(
      request({ dreamId: DREAM_ID, description: 'a calm dream about the sea' })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; generationStatus: string };
    expect(body.generationStatus).toBe('complete');
    expect(body.id).toBe('media-1');
    expect(consumeCredit).toHaveBeenCalledWith({ p_user_id: USER_ID });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(refundCredit).not.toHaveBeenCalled();
  });

  it('refunds the credit when the Flux submit request throws', async () => {
    const refundCredit = jest.fn().mockResolvedValue({ data: null, error: null });
    __setSupabaseScript(baseSupabaseScript({ rpc: { refund_image_credit: refundCredit } }));
    __setAnthropicScript(scriptOpenScreen());
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('network down'));

    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'generation_failed' });
    expect(refundCredit).toHaveBeenCalledWith(expect.objectContaining({ p_user_id: USER_ID }));
  });

  it('marks the media row safety_blocked (not just a generic failure) when Flux moderates the prompt', async () => {
    const refundCredit = jest.fn().mockResolvedValue({ data: null, error: null });
    __setSupabaseScript(
      baseSupabaseScript({
        rpc: { refund_image_credit: refundCredit },
        tables: {
          media: [
            { data: null, error: null }, // existing-media lookup
            { data: null, error: null }, // markSafetyBlocked insert (no existing row)
          ],
          interpretations: [{ data: null, error: null }],
        },
      })
    );
    __setAnthropicScript(scriptOpenScreen());
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'moderated' }, { status: 422 }));

    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'safety_blocked' });
    expect(refundCredit).toHaveBeenCalled();
  });
});
