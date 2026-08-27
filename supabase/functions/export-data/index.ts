import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

  // Fetch all dreams + interpretations
  const { data: dreams } = await supabase
    .from('dreams')
    .select('id, description, occurred_at, logged_at, created_at')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .order('occurred_at', { ascending: false });

  const { data: interpretations } = await supabase
    .from('interpretations')
    .select(
      'dream_id, overall_reading, keywords, emotions, cultural_references, created_at, prompt_version'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const exportData = {
    exportedAt: new Date().toISOString(),
    userId: user.id,
    dreams: dreams ?? [],
    interpretations: interpretations ?? [],
  };

  const json = JSON.stringify(exportData, null, 2);
  const timestamp = Date.now();
  const storagePath = `${user.id}/exports/${timestamp}.json`;

  await supabase.storage.from('dream-media').upload(storagePath, new TextEncoder().encode(json), {
    contentType: 'application/json',
    upsert: false,
  });

  const { data: signedData } = await supabase.storage
    .from('dream-media')
    .createSignedUrl(storagePath, 7 * 24 * 60 * 60); // 7-day link

  return new Response(
    JSON.stringify({
      queued: true,
      downloadUrl: signedData?.signedUrl ?? null,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
