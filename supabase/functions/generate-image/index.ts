import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FLUX_API_KEY = Deno.env.get('FLUX_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * Black Forest Labs FLUX.1 Kontext [pro]. Flat 4 credits ($0.04) per image regardless of
 * resolution, ~7-10s end to end — against ~$0.053 and ~30-60s for the gpt-image-2 medium
 * call this replaced. Endpoint and model live in one constant so moving to a FLUX.2 model
 * is a one-line change.
 */
const FLUX_ENDPOINT = 'https://api.bfl.ai/v1/flux-kontext-pro';

/**
 * The generation is asynchronous: the POST returns a polling_url, and the result is only
 * ready a few seconds later. Polling happens inside this invocation so the client contract
 * stays synchronous, which means the whole loop must finish inside Supabase's 150s
 * idle-response window. 90s is ~9x the expected latency and still ~60s of headroom.
 */
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 90_000;

/** Used when the active system_prompts row predates image_prompt_directive (migration 017). */
const FALLBACK_STYLE_DIRECTIVE =
  'Rendered as a painterly, non-photorealistic dream illustration: soft volumetric light, ' +
  'visible brushwork, atmospheric depth. Palette centred on deep indigo and midnight blue ' +
  'with warm amber highlights. A single coherent scene. No text, letters, captions, ' +
  'watermarks, signatures or logos anywhere in the image.';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Flux reports moderation through the polling status rather than an HTTP error, and uses two
 * distinct strings depending on whether the prompt or the output tripped it.
 */
function isModerationStatus(status: string): boolean {
  return status === 'Content Moderated' || status === 'Request Moderated';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Unlike the original, the whole handler is wrapped: an unexpected throw used to surface as
  // an unhandled rejection with a bare 500 and no log line.
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const { dreamId, description, keywords, isRegeneration } = await req.json();
    if (!dreamId || !description) {
      return json({ error: 'missing_fields' }, 400);
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
      return json({ error: 'limit_reached', resetDate: nextMonth.toISOString() }, 429);
    }

    // Check regeneration limit if applicable. Each call inserts a new media row
    // rather than updating one in place, so the running count has to be read off
    // the most recent row and carried forward below -- it cannot live on the row
    // being checked here.
    let existingMedia: { regeneration_count: number; max_regenerations: number } | null = null;
    if (isRegeneration) {
      const { data } = await supabase
        .from('media')
        .select('regeneration_count, max_regenerations')
        .eq('dream_id', dreamId)
        .eq('media_type', 'image')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      existingMedia = data;

      if (existingMedia && existingMedia.regeneration_count >= existingMedia.max_regenerations) {
        return json({ error: 'regen_limit_reached', max: existingMedia.max_regenerations }, 409);
      }
    }

    // Build prompt. The interpretation model writes the visual prompt while it still has the
    // dream, its emotions, its archetype and its themes in context (system_prompts v2.0.0), so
    // the good path is a straight read. The description+keywords template below is the
    // fallback for a dream that was never interpreted -- maybeSingle, since zero rows is a
    // perfectly valid state here, not an error.
    const { data: interpretationRow, error: promptReadError } = await supabase
      .from('interpretations')
      .select('image_prompt')
      .eq('dream_id', dreamId)
      .not('image_prompt', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (promptReadError) {
      console.error('image_prompt lookup failed, falling back to template:', promptReadError);
    }

    const { data: promptRow } = await supabase
      .from('system_prompts')
      .select('image_prompt_directive')
      .eq('is_active', true)
      .maybeSingle();

    const authoredPrompt: string | null = interpretationRow?.image_prompt ?? null;
    const scenePrompt = authoredPrompt ?? (() => {
      const keywordStr = keywords?.length ? ` Key symbols: ${keywords.slice(0, 5).join(', ')}.` : '';
      return `A dream scene: ${description.slice(0, 300)}${keywordStr}`;
    })();
    const styleDirective = promptRow?.image_prompt_directive ?? FALLBACK_STYLE_DIRECTIVE;
    const prompt = `${scenePrompt}\n\n${styleDirective}`;

    console.log(
      `Calling Flux ${FLUX_ENDPOINT} for dream ${dreamId} ` +
        `(prompt source: ${authoredPrompt ? 'interpretation' : 'fallback template'})`
    );

    // A regeneration re-rolls the seed so "regenerate" produces a genuinely different image.
    // With a fixed prompt and no seed, Flux would return near-identical output every time.
    const submitBody: Record<string, unknown> = {
      prompt,
      aspect_ratio: '1:1',
      output_format: 'png',
      safety_tolerance: 2,
      prompt_upsampling: false,
    };
    if (isRegeneration) {
      submitBody.seed = Math.floor(Math.random() * 2_147_483_647);
    }

    let submitResponse: Response;
    try {
      submitResponse = await fetch(FLUX_ENDPOINT, {
        method: 'POST',
        headers: {
          'x-key': FLUX_API_KEY,
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitBody),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      console.error('Flux submit request failed:', err);
      return json({ error: 'generation_failed' }, 503);
    }

    if (!submitResponse.ok) {
      const detail = await submitResponse.text();
      // 422 is BFL's validation/moderation rejection of the prompt itself.
      if (submitResponse.status === 422) {
        console.error('Flux rejected the prompt (422):', detail);
        return json({ error: 'safety_blocked' }, 400);
      }
      // The two operational failures, called out by name. Both otherwise present to the
      // user as an ordinary "generation failed, retry" — which is actively misleading,
      // since no amount of retrying fixes either one, and only the operator can.
      if (submitResponse.status === 402) {
        console.error(
          'FLUX ACCOUNT OUT OF CREDITS — image generation is down until the BFL account is topped up:',
          detail
        );
      } else if (submitResponse.status === 401 || submitResponse.status === 403) {
        console.error(
          'FLUX_API_KEY REJECTED — check the secret is a bfl.ai API key and is still active:',
          detail
        );
      } else {
        console.error(`Flux submit failed (${submitResponse.status}):`, detail);
      }
      return json({ error: 'generation_failed' }, 503);
    }

    const submitData = await submitResponse.json();
    const pollingUrl: string | undefined = submitData?.polling_url;
    if (!pollingUrl) {
      console.error('Flux submit returned no polling_url:', JSON.stringify(submitData));
      return json({ error: 'generation_failed' }, 503);
    }

    // Poll until Ready. Bounded by POLL_TIMEOUT_MS so a stuck task fails loudly and logged
    // instead of being killed by the platform's idle-response timeout with no log at all.
    let sampleUrl: string | null = null;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      let pollResponse: Response;
      try {
        pollResponse = await fetch(pollingUrl, {
          method: 'GET',
          headers: { 'x-key': FLUX_API_KEY, 'accept': 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        console.error('Flux poll request failed:', err);
        return json({ error: 'generation_failed' }, 503);
      }

      if (!pollResponse.ok) {
        console.error(`Flux poll failed (${pollResponse.status}):`, await pollResponse.text());
        return json({ error: 'generation_failed' }, 503);
      }

      const pollData = await pollResponse.json();
      const status: string = pollData?.status ?? '';

      if (status === 'Ready') {
        sampleUrl = pollData?.result?.sample ?? null;
        break;
      }
      if (isModerationStatus(status)) {
        console.error('Flux moderated the request for dream', dreamId, '-', status);
        return json({ error: 'safety_blocked' }, 400);
      }
      if (status === 'Error' || status === 'Failed') {
        console.error('Flux generation failed:', JSON.stringify(pollData));
        return json({ error: 'generation_failed' }, 503);
      }
      // 'Pending' / 'Task not found' (briefly, right after submit) -- keep polling.
    }

    if (!sampleUrl) {
      console.error(`Flux generation did not become Ready within ${POLL_TIMEOUT_MS}ms for dream`, dreamId);
      return json({ error: 'generation_failed' }, 503);
    }

    // result.sample is a signed URL valid for 10 minutes; the bytes are copied into our own
    // bucket immediately so nothing downstream ever depends on that window.
    let imageBuffer: Uint8Array;
    try {
      const imageResponse = await fetch(sampleUrl, { signal: AbortSignal.timeout(30_000) });
      if (!imageResponse.ok) {
        console.error('Fetching the Flux result URL failed:', imageResponse.status);
        return json({ error: 'generation_failed' }, 503);
      }
      imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
    } catch (err) {
      console.error('Fetching the Flux result URL failed:', err);
      return json({ error: 'generation_failed' }, 503);
    }

    const storagePath = `${user.id}/${dreamId}/image-${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from('dream-media')
      .upload(storagePath, imageBuffer, { contentType: 'image/png', upsert: false });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return json({ error: 'upload_failed' }, 503);
    }

    // 3 regenerations per entry for free users, 5 for premium (data-model.md,
    // FR-029). A regeneration carries forward the limit + count the entry already
    // had -- the limit is only derived fresh from the current tier on the first
    // generation for this dream -- so a mid-cycle tier change doesn't retroactively
    // change an in-progress entry's allowance, and the count actually climbs
    // instead of resetting to 1 on every regenerate.
    const maxRegenerations =
      existingMedia?.max_regenerations ?? (entitlement?.subscription_tier === 'premium' ? 5 : 3);
    const regenerationCount = isRegeneration ? (existingMedia?.regeneration_count ?? 0) + 1 : 0;

    // Insert media record
    const { data: media, error: insertError } = await supabase
      .from('media')
      .insert({
        dream_id: dreamId,
        user_id: user.id,
        media_type: 'image',
        storage_key: storagePath,
        generation_status: 'complete',
        regeneration_count: regenerationCount,
        max_regenerations: maxRegenerations,
      })
      .select()
      .single();

    if (insertError || !media) {
      console.error('Media insert failed:', insertError);
      return json({ error: 'record_failed' }, 503);
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

    return json({
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
    }, 200);
  } catch (err) {
    console.error('generate-image edge function error:', err);
    return json({ error: 'generation_failed' }, 503);
  }
});
