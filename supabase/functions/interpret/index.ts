import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.120.0';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

/**
 * Single source of truth for the model id — it is written both to the API call and to
 * `interpretations.model_used`, which used to be two independently hardcoded literals that
 * could drift apart silently. The client mirrors this constant in
 * `src/app/(main)/journal/[dreamId]/interpretation.tsx` for the waiting-screen label only.
 *
 * Haiku 4.5 rather than a Sonnet tier: dream interpretation is creative pattern-reading, not
 * reasoning. The quality lever is the active `system_prompts` row, not the model tier — which
 * is why the version is deliberately not named here. It moves without touching this file.
 */
const INTERPRETATION_MODEL = 'claude-haiku-4-5';

/**
 * `strict: true` is GA on the Messages API but is not in the SDK's exported `Tool` type at
 * this pin, so the field is widened here rather than dropped. It guarantees `toolUse.input`
 * validates against the schema, which matters more on a smaller model.
 */
type StrictTool = Anthropic.Tool & { strict?: boolean };

const FORMAT_INTERPRETATION_TOOL: StrictTool = {
  name: 'format_interpretation',
  description: 'Format a structured dream interpretation.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      overall_reading: {
        type: 'string',
        description:
          'The interpretation itself: 5-6 sentences of flowing prose that name what the dream is ' +
          'doing, read the 2-3 heaviest symbols as they function *in this dream* specifically, and ' +
          'close on what the dream appears to be surfacing for the dreamer. This is the product — ' +
          'a short or generic reading is a failed one.',
      },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Concrete nouns and images actually present in the dream (6-8 items; give 8 unless the dream truly holds fewer).' },
      emotions: { type: 'array', items: { type: 'string' }, description: 'Emotions carried by the dream itself (3-5 items).' },
      cultural_references: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            symbol: { type: 'string' },
            tradition: { type: 'string' },
            meaning: { type: 'string' },
          },
          required: ['symbol', 'tradition', 'meaning'],
        },
        description:
          'Symbols that genuinely appear in this dream, each paired with a precisely named tradition ' +
          '("Norse mythology", "Japanese folklore" — never "many cultures") and what that tradition ' +
          'holds it to mean. Three entries, or four when the dream supports it. Each `meaning` is one ' +
          'or two substantial sentences that teach the dreamer something, not a four-word gloss.',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Confidence in interpretation quality. Low if description is vague or very short.',
      },
      archetype: {
        type: 'string',
        description: 'A short phrase (2-5 words) naming the dominant Jungian or narrative archetype in this dream, e.g. "The Seeker", "The Shadow Self".',
      },
      themes: {
        type: 'array',
        items: { type: 'string' },
        description: 'The 3-4 dominant recurring themes/motifs of this dream, as short tags (e.g. "flying", "family conflict"), distinct from `keywords` which lists concrete symbols.',
      },
      symbolic_density: {
        type: 'integer',
        // `enum`, not `minimum`/`maximum`: numeric range keywords are not supported under
        // strict tool use and are rejected. The enum enforces the same 1-4 range the
        // `symbolic_density BETWEEN 1 AND 4` CHECK in 016_interpretation_archetype.sql needs,
        // and does it as a hard guarantee rather than a hint.
        enum: [1, 2, 3, 4],
        description: 'How symbolically dense/layered this dream is, 1 (literal, few symbols) to 4 (highly symbolic, many layered meanings).',
      },
      image_prompt: {
        type: 'string',
        description:
          'An English text-to-image prompt (one paragraph, max 60 words) illustrating this dream for the Flux image model. Concrete visual nouns from the dream, one focal subject, a named light source and palette drawn from the emotional tone, and a stated composition. No style or medium words — the app appends its own art direction. Never any text, letters, watermarks, real named people, injury or nudity.',
      },
    },
    required: [
      'overall_reading',
      'keywords',
      'emotions',
      'cultural_references',
      'confidence',
      'archetype',
      'themes',
      'symbolic_density',
      'image_prompt',
    ],
  },
};

interface RequestMetadata {
  tone?: string | null;
  lucidity?: string;
  dreamType?: string[];
  clarity?: number | null;
  dreamEnding?: string | null;
  characters?: string[];
  places?: string[];
  emotions?: string[];
  isLucid?: boolean;
  occurredAt?: string | null;
  sleepQuality?: number | null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Day-of-week and month only, never a season: the hemisphere is unknown, so "winter" would be
 * a coin flip stated as fact. The model can weigh a month against whatever the dream itself
 * says about weather or light.
 */
function formatOccurredAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${WEEKDAYS[date.getUTCDay()]} night, ${MONTHS[date.getUTCMonth()]}`;
}

/**
 * Appended to the user message, never the system prompt — `promptRow.version` tracks
 * which prompt template produced a reading, a separate axis from what per-request data
 * that reading was informed by. Only mentions fields actually present, so a dream
 * logged without extra metadata doesn't get a prompt full of "not specified" noise.
 *
 * `dayStress` and `presleepSubstances` are deliberately absent: 015_dream_metadata.sql keeps
 * those local-SQLite-only and they never leave the device.
 */
function formatMetadataBlock(m?: RequestMetadata): string {
  if (!m) return '';
  const lines: string[] = [];
  if (m.tone) lines.push(`- Tone the dreamer assigned: ${m.tone}`);
  if (m.emotions?.length) lines.push(`- Emotions the dreamer tagged: ${m.emotions.join(', ')}`);
  if (m.lucidity && m.lucidity !== 'none') lines.push(`- Lucidity: ${m.lucidity}`);
  else if (m.isLucid) lines.push('- The dreamer marked this dream as lucid');
  if (m.clarity != null) lines.push(`- Dream clarity/vividness (1-5): ${m.clarity}`);
  // The enum values are glossed rather than passed bare: 'fragmented' in particular
  // reads ambiguously on its own, and this field is meant to carry real weight in the
  // archetype call — an unresolved dream and a resolved one are different stories.
  if (m.dreamEnding) {
    lines.push(
      `- How the dream ended: ${m.dreamEnding} (resolved = reached closure, ` +
        `unresolved = left hanging, fragmented = broke apart or dissolved)`
    );
  }
  if (m.dreamType?.length) lines.push(`- Dreamer-tagged type(s): ${m.dreamType.join(', ')}`);
  if (m.characters?.length) lines.push(`- Characters present: ${m.characters.join(', ')}`);
  if (m.places?.length) lines.push(`- Places/settings: ${m.places.join(', ')}`);
  if (m.sleepQuality != null) lines.push(`- Sleep quality that night (1-5): ${m.sleepQuality}`);
  if (m.occurredAt) {
    const when = formatOccurredAt(m.occurredAt);
    if (when) lines.push(`- When the dream occurred: ${when}`);
  }
  if (!lines.length) return '';
  return `\n\nAdditional context the dreamer noted (use this to inform your reading of tone, archetype and themes — the ending in particular shapes the narrative arc the archetype names — do not simply restate it back):\n${lines.join('\n')}`;
}

/**
 * Tiebreaker for descriptions too short to language-detect. The base prompt already tells the
 * model to match the dream's own language first; this only decides the coin flip.
 */
function formatLanguageHint(hint?: string): string {
  if (!hint) return '';
  return `\n\nDreamer's app language: ${hint}`;
}

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Set once the interpretation credit has been consumed, so every failure path —
  // including an unexpected throw — can return it.
  let creditConsumedFor: string | null = null;
  const refundCredit = async (reason: string) => {
    if (!creditConsumedFor) return;
    const userId = creditConsumedFor;
    creditConsumedFor = null;
    const { error: refundError } = await supabase.rpc('refund_interpretation_credit', {
      p_user_id: userId,
    });
    if (refundError) {
      console.error(`Failed to refund interpretation credit after ${reason}:`, refundError);
    }
  };

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Check consent
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('ai_consent_granted, interpretation_style')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile query failed:', profileError);
      return new Response(JSON.stringify({ error: 'Profile fetch failed', detail: profileError.message }), { status: 500 });
    }

    if (!profile?.ai_consent_granted) {
      return new Response(JSON.stringify({ error: 'Consent required' }), { status: 403 });
    }

    // Check + increment entitlement in one statement (012_entitlement_credit_rpc.sql).
    // A read-then-write here would let concurrent requests both pass the limit check.
    // The credit is refunded below if the interpretation cannot be produced.
    const { data: creditGranted, error: entError } = await supabase.rpc(
      'consume_interpretation_credit',
      { p_user_id: user.id }
    );

    if (entError) {
      console.error('Entitlement check failed:', entError);
      return new Response(JSON.stringify({ error: 'Entitlement check failed' }), { status: 500 });
    }

    if (!creditGranted) {
      const resetDate = new Date();
      resetDate.setMonth(resetDate.getMonth() + 1, 1);
      resetDate.setHours(0, 0, 0, 0);
      return new Response(
        JSON.stringify({ error: 'Limit exceeded', resetDate: resetDate.toISOString() }),
        { status: 429 }
      );
    }

    creditConsumedFor = user.id;

    const body = await req.json() as {
      dreamId: string;
      description: string;
      style?: string;
      languageHint?: string;
      metadata?: RequestMetadata;
    };

    // Fetch active system prompt
    const { data: promptRow } = await supabase
      .from('system_prompts')
      .select('version, base_prompt, symbolic_style, mythological_style, psychological_style')
      .eq('is_active', true)
      .single();

    if (!promptRow) {
      console.error('No active system prompt found in system_prompts table');
      await refundCredit('missing system prompt');
      return new Response(JSON.stringify({ error: 'No active system prompt' }), { status: 500 });
    }

    const style = (body.style ?? profile.interpretation_style ?? 'symbolic') as 'symbolic' | 'mythological' | 'psychological';
    const stylePrompt = style === 'mythological' ? promptRow.mythological_style
      : style === 'psychological' ? promptRow.psychological_style
      : promptRow.symbolic_style;

    const systemPrompt = `${promptRow.base_prompt}\n\nStyle focus: ${stylePrompt}`;

    // Call Claude Haiku 4.5. No `thinking` and no `output_config.effort`: Haiku 4.5 predates
    // the adaptive-thinking family, `effort` errors on it, and thinking would spend the
    // latency win this model was chosen for. Temperature is left at the API default (1.0),
    // the creative end, which is what a dream reading wants.
    const message = await anthropic.messages.create({
      model: INTERPRETATION_MODEL,
      max_tokens: 3072,
      system: systemPrompt,
      tools: [FORMAT_INTERPRETATION_TOOL],
      // Naming the tool rather than `{ type: 'any' }`: there is exactly one tool, and being
      // explicit removes the "no tool_use block" 503 path below on a smaller model.
      tool_choice: { type: 'tool', name: 'format_interpretation' },
      messages: [
        {
          role: 'user',
          content:
            `Please interpret this dream:\n\n${body.description}` +
            formatMetadataBlock(body.metadata) +
            formatLanguageHint(body.languageHint),
        },
      ],
    });

    const toolUse = message.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      await refundCredit('AI provider returned no tool_use block');
      return new Response(JSON.stringify({ error: 'AI provider error' }), { status: 503 });
    }

    const input = toolUse.input as {
      overall_reading: string;
      keywords: string[];
      emotions: string[];
      cultural_references: Array<{ symbol: string; tradition: string; meaning: string }>;
      confidence: 'high' | 'medium' | 'low';
      archetype: string;
      themes: string[];
      symbolic_density: number;
      image_prompt: string;
    };

    const isDegraded = input.confidence === 'low';

    // Insert interpretation
    const { data: interpretation, error: insertError } = await supabase
      .from('interpretations')
      .insert({
        dream_id: body.dreamId,
        user_id: user.id,
        overall_reading: input.overall_reading,
        keywords: input.keywords,
        emotions: input.emotions,
        cultural_references: input.cultural_references,
        confidence: input.confidence,
        is_degraded: isDegraded,
        prompt_version: promptRow.version,
        model_used: INTERPRETATION_MODEL,
        archetype: input.archetype,
        themes: input.themes,
        symbolic_density: input.symbolic_density,
        image_prompt: input.image_prompt,
      })
      .select()
      .single();

    if (insertError || !interpretation) {
      console.error('Interpretation insert failed:', insertError);
      await refundCredit('interpretation insert failure');
      return new Response(JSON.stringify({ error: 'Failed to save interpretation' }), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        id: interpretation.id,
        dreamId: body.dreamId,
        overallReading: interpretation.overall_reading,
        keywords: interpretation.keywords,
        emotions: interpretation.emotions,
        culturalReferences: interpretation.cultural_references,
        confidence: interpretation.confidence,
        isDegraded: interpretation.is_degraded,
        promptVersion: interpretation.prompt_version,
        modelUsed: interpretation.model_used,
        createdAt: interpretation.created_at,
        archetype: interpretation.archetype,
        themes: interpretation.themes,
        symbolicDensity: interpretation.symbolic_density,
        imagePrompt: interpretation.image_prompt,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('interpret edge function error:', err);
    // No interpretation was returned, so the user must not be charged for it.
    await refundCredit('unhandled error');
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
