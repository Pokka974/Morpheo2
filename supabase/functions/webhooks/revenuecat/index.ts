import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_AUTH_HEADER = Deno.env.get('REVENUECAT_WEBHOOK_AUTH_HEADER') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req: Request) => {
  // Validate RevenueCat HMAC signature header
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== WEBHOOK_AUTH_HEADER) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const event = await req.json();
  const eventType: string = event?.event?.type ?? '';
  const appUserId: string = event?.event?.app_user_id ?? '';
  const expiresAt: string | null = event?.event?.expiration_at_ms
    ? new Date(event.event.expiration_at_ms).toISOString()
    : null;

  if (!appUserId) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let tier: 'free' | 'premium' | null = null;
  if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL') {
    tier = 'premium';
  } else if (eventType === 'EXPIRATION') {
    tier = 'free';
  }
  // CANCELLATION: no immediate action — premium continues until expiry

  if (tier === null) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  // entitlements is the source of truth; profiles.subscription_tier is a denormalized
  // copy for RLS performance (data-model.md). Both must move together.
  const { error: entError } = await supabase
    .from('entitlements')
    .update({
      subscription_tier: tier,
      subscription_expires_at: tier === 'premium' ? expiresAt : null,
    })
    .eq('user_id', appUserId);

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
    return new Response(JSON.stringify({ error: 'entitlement_update_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
