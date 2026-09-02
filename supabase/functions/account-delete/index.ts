import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Exact confirmation string per contracts/api-endpoints.md (C1 fix)
const REQUIRED_CONFIRMATION = 'DELETE MY ACCOUNT';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader)
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user)
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });

  const { confirmation } = await req.json();

  // Exact string match — no trim, no case-insensitive (C1 fix)
  if (confirmation !== REQUIRED_CONFIRMATION) {
    return new Response(JSON.stringify({ error: 'invalid_confirmation' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Schedule deletion — hard delete after 30 days via pg_cron (T135).
  // This MUST be persisted before signing the user out: if the write fails we have to
  // report failure, and a signed-out user cannot retry.
  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 30);

  const { error: scheduleError } = await supabase
    .from('profiles')
    .update({ deletion_scheduled_at: scheduledAt.toISOString() })
    .eq('id', user.id);

  if (scheduleError) {
    console.error('Failed to schedule account deletion', {
      userId: user.id,
      error: scheduleError.message,
    });
    return new Response(JSON.stringify({ error: 'schedule_failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Sign out all sessions globally. Deletion is already recorded, so a failure here
  // is not fatal to the request — but it must not pass unnoticed.
  //
  // `admin.signOut` is not a lookup by user id: it POSTs /logout bearing whatever JWT it
  // is handed. Passing `user.id` sent a bare UUID as the bearer token, so GoTrue answered
  // `invalid JWT: ... token contains an invalid number of segments` on every deletion and
  // every session stayed alive — logged, and swallowed, since the branch below is not
  // fatal. Verified against the local stack in #2.
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const { error: signOutError } = await supabase.auth.admin.signOut(accessToken, 'global');
  if (signOutError) {
    console.error('Global sign-out after deletion scheduling failed', {
      userId: user.id,
      error: signOutError.message,
    });
  }

  return new Response(
    JSON.stringify({ scheduled: true, deletionDate: scheduledAt.toISOString() }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
