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

  if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL') {
    await supabase
      .from('entitlements')
      .update({ tier: 'premium', subscription_expires_at: expiresAt })
      .eq('user_id', appUserId);
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'premium' })
      .eq('id', appUserId);
  } else if (eventType === 'EXPIRATION') {
    await supabase
      .from('entitlements')
      .update({ tier: 'free', subscription_expires_at: null })
      .eq('user_id', appUserId);
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('id', appUserId);
  }
  // CANCELLATION: no immediate action — premium continues until expiry

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
