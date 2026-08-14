import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
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

  const { dreamId, description, keywords, isRegeneration } = await req.json();
  if (!dreamId || !description) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: corsHeaders });
  }

  // Check entitlements
  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('tier, image_generations_used_this_month, monthly_image_limit')
    .eq('user_id', user.id)
    .single();

  if (entitlement && entitlement.image_generations_used_this_month >= entitlement.monthly_image_limit) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    return new Response(JSON.stringify({ error: 'limit_reached', resetDate: nextMonth.toISOString() }), { status: 429, headers: corsHeaders });
  }

  // Check regeneration limit if applicable
  if (isRegeneration) {
    const { data: existingMedia } = await supabase
      .from('media')
      .select('regeneration_count, max_regenerations')
      .eq('dream_id', dreamId)
      .eq('media_type', 'image')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingMedia && existingMedia.regeneration_count >= existingMedia.max_regenerations) {
      return new Response(
        JSON.stringify({ error: 'regen_limit_reached', max: existingMedia.max_regenerations }),
        { status: 409, headers: corsHeaders }
      );
    }
  }

  // Build prompt
  const keywordStr = keywords?.length ? ` Key symbols: ${keywords.slice(0, 5).join(', ')}.` : '';
  const prompt = `Dreamlike, surreal illustration of: ${description.slice(0, 300)}${keywordStr} Artistic, imaginative, non-photorealistic style. No text.`;

  // Call DALL-E 3
  const openAiResponse = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' }),
  });

  if (!openAiResponse.ok) {
    const err = await openAiResponse.json();
    const isSafetyBlock = err?.error?.code === 'content_policy_violation';
    if (isSafetyBlock) {
      return new Response(JSON.stringify({ error: 'safety_blocked' }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: 'generation_failed' }), { status: 503, headers: corsHeaders });
  }

  const openAiData = await openAiResponse.json();
  const imageUrl = openAiData.data[0].url;

  // Download and upload to Supabase Storage
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const storagePath = `${user.id}/${dreamId}/image-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('dream-media')
    .upload(storagePath, imageBuffer, { contentType: 'image/png', upsert: false });

  if (uploadError) {
    return new Response(JSON.stringify({ error: 'upload_failed' }), { status: 503, headers: corsHeaders });
  }

  // Insert media record
  const { data: media, error: insertError } = await supabase
    .from('media')
    .insert({
      dream_id: dreamId,
      user_id: user.id,
      media_type: 'image',
      storage_path: storagePath,
      generation_status: 'complete',
      regeneration_count: isRegeneration ? 1 : 0,
      max_regenerations: 3,
    })
    .select()
    .single();

  if (insertError || !media) {
    return new Response(JSON.stringify({ error: 'record_failed' }), { status: 503, headers: corsHeaders });
  }

  // Get signed URL (valid 1 hour)
  const { data: signedData } = await supabase.storage
    .from('dream-media')
    .createSignedUrl(storagePath, 3600);

  // Increment usage counter
  await supabase
    .from('entitlements')
    .update({ image_generations_used_this_month: (entitlement?.image_generations_used_this_month ?? 0) + 1 })
    .eq('user_id', user.id);

  return new Response(JSON.stringify({
    id: media.id,
    dreamId: media.dream_id,
    mediaType: 'image',
    generationStatus: 'complete',
    signedUrl: signedData?.signedUrl ?? null,
    localCachePath: null,
    regenerationCount: media.regeneration_count,
    maxRegenerations: media.max_regenerations,
    errorMessage: null,
    createdAt: media.created_at,
    updatedAt: media.updated_at,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
