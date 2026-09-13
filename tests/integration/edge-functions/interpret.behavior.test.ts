// Behavioral tests for the interpret Edge Function — see ../_harness/ and
// account-delete.behavior.test.ts's header comment for why this file exists alongside
// interpret.test.ts's source-text guards rather than instead of them.
import { loadEdgeFunctionHandler } from './_harness/loadEdgeFunctionHandler';
import { __setSupabaseScript } from './_harness/supabaseJsShim';
import { __setAnthropicScript } from './_harness/anthropicSdkShim';
import type { SupabaseScript } from './_harness/fakeSupabaseClient';

const USER_ID = 'user-123';
const DREAM_ID = 'dream-456';

function request(body: unknown, authHeader: string | null = 'Bearer a-valid-jwt'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader !== null) headers['Authorization'] = authHeader;
  return new Request('https://example.com/interpret', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const VALID_INTERPRETATION_INPUT = {
  overall_reading: 'A reading that names what the dream is doing.',
  keywords: ['ocean', 'lighthouse'],
  emotions: ['calm', 'awe'],
  cultural_references: [
    { symbol: 'lighthouse', tradition: 'maritime folklore', meaning: 'guidance' },
  ],
  confidence: 'high',
  archetype: 'The Seeker',
  themes: ['guidance', 'solitude'],
  symbolic_density: 3,
  image_prompt: 'A lighthouse over a calm ocean at dusk.',
};

function scriptSuccessfulScreen() {
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
      profiles: [
        { data: { ai_consent_granted: true, interpretation_style: 'symbolic' }, error: null },
      ],
      system_prompts: [
        {
          data: {
            version: 'v2.1.0',
            base_prompt: 'Base prompt.',
            symbolic_style: 'Symbolic style.',
            mythological_style: 'Mythological style.',
            psychological_style: 'Psychological style.',
          },
          error: null,
        },
      ],
      interpretations: [
        {
          data: { id: 'interp-1', ...VALID_INTERPRETATION_INPUT, is_degraded: false },
          error: null,
        },
      ],
      ...overrides.tables,
    },
    rpc: {
      consume_interpretation_credit: jest.fn().mockResolvedValue({ data: true, error: null }),
      refund_interpretation_credit: jest.fn().mockResolvedValue({ data: null, error: null }),
      ...overrides.rpc,
    },
  };
}

describe('interpret Edge Function behavior', () => {
  let handler: ReturnType<typeof loadEdgeFunctionHandler>;

  beforeAll(() => {
    handler = loadEdgeFunctionHandler('interpret');
  });

  it('returns 401 with no Authorization header', async () => {
    // interpret creates its Supabase client before checking for a header at all, unlike the
    // other three functions — so even this early-exit path needs a client configured.
    __setSupabaseScript(baseSupabaseScript());
    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }, null));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the caller is not a recognized user', async () => {
    __setSupabaseScript(
      baseSupabaseScript({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      })
    );
    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when AI consent has not been granted', async () => {
    __setSupabaseScript(
      baseSupabaseScript({
        tables: {
          profiles: [
            { data: { ai_consent_granted: false, interpretation_style: null }, error: null },
          ],
        },
      })
    );
    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Consent required' });
  });

  it('returns 429 with a resetDate when the monthly credit is exhausted', async () => {
    __setSupabaseScript(
      baseSupabaseScript({
        rpc: {
          consume_interpretation_credit: jest.fn().mockResolvedValue({ data: false, error: null }),
        },
      })
    );
    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; resetDate: string };
    expect(body.error).toBe('Limit exceeded');
    expect(new Date(body.resetDate).getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks unsafe dream text before calling the model, and refunds the just-spent credit', async () => {
    const refund = jest.fn().mockResolvedValue({ data: null, error: null });
    __setSupabaseScript(baseSupabaseScript({ rpc: { refund_interpretation_credit: refund } }));
    __setAnthropicScript(scriptBlockedScreen());

    const res = await handler(request({ dreamId: DREAM_ID, description: 'unsafe dream text' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'safety_blocked' });
    expect(refund).toHaveBeenCalledWith({ p_user_id: USER_ID });
  });

  it('produces an interpretation on the happy path, honoring an explicit style override', async () => {
    __setSupabaseScript(baseSupabaseScript());
    __setAnthropicScript({
      ...scriptSuccessfulScreen(),
      format_interpretation: jest.fn().mockResolvedValue({
        content: [{ type: 'tool_use', input: VALID_INTERPRETATION_INPUT }],
      }),
    });

    const res = await handler(
      request({
        dreamId: DREAM_ID,
        description: 'a calm dream about the sea',
        style: 'mythological',
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { overallReading: string; imagePrompt: string };
    expect(body.overallReading).toBe(VALID_INTERPRETATION_INPUT.overall_reading);
    expect(body.imagePrompt).toBe(VALID_INTERPRETATION_INPUT.image_prompt);
  });

  it('refunds the credit and returns 500 when saving the interpretation fails', async () => {
    const refund = jest.fn().mockResolvedValue({ data: null, error: null });
    __setSupabaseScript(
      baseSupabaseScript({
        tables: { interpretations: [{ data: null, error: { message: 'insert failed' } }] },
        rpc: { refund_interpretation_credit: refund },
      })
    );
    __setAnthropicScript({
      ...scriptSuccessfulScreen(),
      format_interpretation: jest.fn().mockResolvedValue({
        content: [{ type: 'tool_use', input: VALID_INTERPRETATION_INPUT }],
      }),
    });

    const res = await handler(request({ dreamId: DREAM_ID, description: 'a dream' }));

    expect(res.status).toBe(500);
    expect(refund).toHaveBeenCalledWith({ p_user_id: USER_ID });
  });
});
