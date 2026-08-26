import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Matches the lifetime `generate-image` hands back for a freshly generated image.
 * Nothing persists the URL — the client downloads the bytes once and keeps the file,
 * so the expiry only has to outlive a single download. */
const SIGNED_URL_TTL_SECONDS = 3600;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// `Content-Type` is not optional here: supabase-js picks its parser from this
// header, and without it the JSON body comes back to the client as a raw string
// whose `.signedUrl` reads `undefined` — a silent failure rather than an error.
function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Mints a short-lived download URL for one media row's stored object.
 *
 * A device only ever holds `storage_key` (a bucket path, not a URL) for media
 * generated somewhere else, so without this there is no way to turn a synced media
 * row into displayable bytes on a second device.
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  let mediaId: unknown;
  try {
    ({ mediaId } = await req.json());
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  if (typeof mediaId !== 'string' || mediaId.length === 0) {
    return json({ error: 'missing_fields' }, 400);
  }

  // Read through the *user's* client so the `media_select_own` RLS policy is what
  // enforces ownership — a row belonging to someone else simply returns zero rows
  // rather than relying on a hand-written check here staying correct.
  // `maybeSingle()` because "no such media for this user" is a valid 404, not an error.
  const { data: media, error: mediaError } = await userClient
    .from('media')
    .select('id, storage_key')
    .eq('id', mediaId)
    .maybeSingle();

  if (mediaError) {
    console.error('Media lookup failed:', mediaError);
    return json({ error: 'lookup_failed' }, 503);
  }
  if (!media) return json({ error: 'not_found' }, 404);

  // A row can legitimately exist with no object yet (pending/processing/failed
  // generation); there is simply nothing to sign for it.
  if (!media.storage_key) return json({ error: 'no_object' }, 404);

  // Signing needs the service role: the bucket is private and carries no storage
  // policy granting end users read access directly.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: signed, error: signError } = await serviceClient.storage
    .from('dream-media')
    .createSignedUrl(media.storage_key, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    console.error('Signing failed:', signError);
    return json({ error: 'sign_failed' }, 503);
  }

  return json({ signedUrl: signed.signedUrl }, 200);
});
