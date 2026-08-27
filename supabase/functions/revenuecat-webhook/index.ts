import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_AUTH_HEADER = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_HEADER') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// `Content-Type` is not optional: without it a JSON body arrives at the caller as a raw
// string, so `.error` and `.ok` both read `undefined` — a silent pass where there was a
// failure. `media-url` documents the same trap.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Compares the shared secret without leaking its length or a prefix match through timing.
 * Not an HMAC — RevenueCat sends whatever literal string is configured in its dashboard's
 * Authorization field, and this asserts equality with the secret of the same name.
 */
function secretsMatch(received: string | null, expected: string): boolean {
  // An unset secret must reject everything. Without this guard `expected` is '' and a
  // request sending a literal empty Authorization header would authenticate.
  if (!expected || received === null) return false;

  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  // Fold the length difference into the result rather than returning early on it.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // RevenueCat only ever POSTs. Without this a GET falls through to `req.json()` and dies
  // as an uncaught 500, which reads as a broken function rather than a wrong method.
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!secretsMatch(req.headers.get('Authorization'), WEBHOOK_AUTH_HEADER)) {
    return json({ error: 'unauthorized' }, 401);
  }

  // A malformed body can never succeed on a retry, so it must not become a 5xx — that
  // would put RevenueCat into a retry loop over a payload that is permanently bad.
  let event: unknown;
  try {
    event = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const payload = (event as { event?: Record<string, unknown> } | null)?.event;
  const eventType = (payload?.type as string) ?? '';
  const appUserId = (payload?.app_user_id as string) ?? '';
  const expiresAtMs = payload?.expiration_at_ms as number | undefined;
  const expiresAt: string | null = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;

  if (!appUserId) return json({ ok: true }, 200);

  // Both tables key on a uuid column, so a non-uuid app_user_id is a PostgREST type error
  // rather than a miss — which would 500 and put RevenueCat into a permanent retry loop.
  // This is the live shape today: nothing calls Purchases.logIn with the Supabase user id
  // yet (#43), so RevenueCat sends its own `$RCAnonymousID:...`.
  if (!UUID_RE.test(appUserId)) {
    console.warn('RevenueCat webhook received a non-uuid app_user_id', { appUserId, eventType });
    return json({ ok: true, matched: 0 }, 200);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let tier: 'free' | 'premium' | null = null;
  if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL') {
    tier = 'premium';
  } else if (eventType === 'EXPIRATION') {
    tier = 'free';
  }
  // CANCELLATION: no immediate action — premium continues until expiry

  if (tier === null) return json({ ok: true }, 200);

  // entitlements is the source of truth; profiles.subscription_tier is a denormalized
  // copy for RLS performance (data-model.md). Both must move together.
  const { data: updatedRows, error: entError } = await supabase
    .from('entitlements')
    .update({
      subscription_tier: tier,
      subscription_expires_at: tier === 'premium' ? expiresAt : null,
    })
    .eq('user_id', appUserId)
    .select('user_id');

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ subscription_tier: tier })
    .eq('id', appUserId);

  // Fail loudly: a 5xx makes RevenueCat retry. Silently returning 200 on a failed
  // write means a paying user never receives premium and the event is never resent.
  if (entError || profileError) {
    console.error('RevenueCat webhook write failed', {
      appUserId,
      eventType,
      entitlementsError: entError?.message,
      profilesError: profileError?.message,
    });
    return json({ error: 'entitlement_update_failed' }, 500);
  }

  // PostgREST does not treat a zero-row UPDATE as an error, so an app_user_id belonging
  // to no user returns 200 having changed nothing. That is what happens for every real
  // purchase until the client calls Purchases.logIn with the Supabase UUID (#43) —
  // RevenueCat sends its own $RCAnonymousID otherwise. Log rather than 5xx: retrying an
  // anonymous id would loop forever.
  if (!updatedRows || updatedRows.length === 0) {
    console.warn('RevenueCat webhook matched no entitlements row', { appUserId, eventType });
    return json({ ok: true, matched: 0 }, 200);
  }

  return json({ ok: true }, 200);
});
