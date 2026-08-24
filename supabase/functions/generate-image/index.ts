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
  const { data: entitlement, error: entError } = await supabase
    .from('entitlements')
    .select('subscription_tier, images_used_this_month, monthly_image_limit')
    .eq('user_id', user.id)
    .single();

  if (entError) {
    console.error('Entitlement query failed:', entError);
  }

  if (entitlement && entitlement.monthly_image_limit !== null && entitlement.images_used_this_month >= entitlement.monthly_image_limit) {
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

  // Call OpenAI's gpt-image-2 (dall-e-3 was removed from the API on 2026-05-12)
  const openAiResponse = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, n: 1, size: '1024x1024', quality: 'high' }),
  });

  if (!openAiResponse.ok) {
    const err = await openAiResponse.json();
    console.error('OpenAI image generation failed:', JSON.stringify(err));
    const isSafetyBlock = err?.error?.code === 'moderation_blocked';
    if (isSafetyBlock) {
      return new Response(JSON.stringify({ error: 'safety_blocked' }), { status: 400, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: 'generation_failed' }), { status: 503, headers: corsHeaders });
  }

  const openAiData = await openAiResponse.json();
  const b64Image = openAiData.data[0].b64_json;
  const imageBuffer = Uint8Array.from(atob(b64Image), (c) => c.charCodeAt(0));
  const storagePath = `${user.id}/${dreamId}/image-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('dream-media')
    .upload(storagePath, imageBuffer, { contentType: 'image/png', upsert: false });

  if (uploadError) {
    console.error('Storage upload failed:', uploadError);
    return new Response(JSON.stringify({ error: 'upload_failed' }), { status: 503, headers: corsHeaders });
  }

  // Insert media record
  const { data: media, error: insertError } = await supabase
    .from('media')
    .insert({
      dream_id: dreamId,
      user_id: user.id,
      media_type: 'image',
      storage_key: storagePath,
      generation_status: 'complete',
      regeneration_count: isRegeneration ? 1 : 0,
      max_regenerations: 3,
    })
    .select()
    .single();

  if (insertError || !media) {
    console.error('Media insert failed:', insertError);
    return new Response(JSON.stringify({ error: 'record_failed' }), { status: 503, headers: corsHeaders });
  }

  // Get signed URL (valid 1 hour)
  const { data: signedData } = await supabase.storage
    .from('dream-media')
    .createSignedUrl(storagePath, 3600);

  // Increment usage counter
  const { error: usageError } = await supabase
    .from('entitlements')
    .update({ images_used_this_month: (entitlement?.images_used_this_month ?? 0) + 1 })
    .eq('user_id', user.id);
  if (usageError) {
    console.error('Failed to increment images_used_this_month:', usageError);
  }

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
