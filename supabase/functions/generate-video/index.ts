import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LUMA_API_KEY = Deno.env.get('LUMA_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });

  // Server-side entitlement check — video is premium-only
  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('subscription_tier')
    .eq('user_id', user.id)
    .single();

  if (!entitlement || entitlement.subscription_tier !== 'premium') {
    return new Response(JSON.stringify({ error: 'premium_required' }), { status: 403, headers: corsHeaders });
  }

  const { dreamId, description, keywords } = await req.json();
  if (!dreamId || !description) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: corsHeaders });
  }

  const keywordStr = keywords?.length ? ` Symbols: ${keywords.slice(0, 4).join(', ')}.` : '';
  const prompt = `Cinematic dreamlike video: ${description.slice(0, 200)}${keywordStr} Surreal, ethereal atmosphere.`;

  // Create media record in pending state
  const { data: media, error: insertError } = await supabase
    .from('media')
    .insert({
      dream_id: dreamId,
      user_id: user.id,
      media_type: 'video',
      generation_status: 'pending',
      regeneration_count: 0,
      max_regenerations: 1,
    })
    .select()
    .single();

  if (insertError || !media) {
    return new Response(JSON.stringify({ error: 'record_failed' }), { status: 503, headers: corsHeaders });
  }

  // Submit to Luma Dream Machine — MUST include do_not_train per constitution Principle III
  const lumaResponse = await fetch('https://api.lumalabs.ai/dream-machine/v2/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LUMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      do_not_train: true, // Constitution Principle III — user data MUST NOT train external models
      aspect_ratio: '9:16',
      loop: false,
    }),
  });

  if (!lumaResponse.ok) {
    await supabase.from('media').update({ generation_status: 'failed', error_message: 'Luma API error' }).eq('id', media.id);
    return new Response(JSON.stringify({ error: 'generation_failed' }), { status: 503, headers: corsHeaders });
  }

  const lumaData = await lumaResponse.json();
  const lumaJobId: string = lumaData.id;

  // Create generation_job record (RLS: no client INSERT — only service role can write)
  const { data: job, error: jobError } = await supabase
    .from('generation_jobs')
    .insert({
      media_id: media.id,
      user_id: user.id,
      provider: 'luma',
      provider_job_id: lumaJobId,
      status: 'queued',
      estimated_duration_seconds: 120,
    })
    .select()
    .single();

  if (jobError || !job) {
    return new Response(JSON.stringify({ error: 'job_record_failed' }), { status: 503, headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    jobId: job.id,
    mediaId: media.id,
    status: 'queued',
    estimatedDurationSeconds: 120,
  }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
