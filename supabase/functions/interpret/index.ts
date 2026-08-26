import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.20.0';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const FORMAT_INTERPRETATION_TOOL: Anthropic.Tool = {
  name: 'format_interpretation',
  description: 'Format a structured dream interpretation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      overall_reading: { type: 'string', description: 'A 2-4 sentence overall reading of the dream.' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'List of symbolic keywords found in the dream (3-8 items).' },
      emotions: { type: 'array', items: { type: 'string' }, description: 'List of emotions present in the dream (2-5 items).' },
      cultural_references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            symbol: { type: 'string' },
            tradition: { type: 'string' },
            meaning: { type: 'string' },
          },
          required: ['symbol', 'tradition', 'meaning'],
        },
        description: 'Cultural or mythological references for symbols in the dream (1-4 items).',
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
        description: 'The 2-4 dominant recurring themes/motifs of this dream, as short tags (e.g. "flying", "family conflict"), distinct from `keywords` which lists concrete symbols.',
      },
      symbolic_density: {
        type: 'integer',
        minimum: 1,
        maximum: 4,
        description: 'How symbolically dense/layered this dream is, 1 (literal, few symbols) to 4 (highly symbolic, many layered meanings).',
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
}

/**
 * Appended to the user message, never the system prompt — `promptRow.version` tracks
 * which prompt template produced a reading, a separate axis from what per-request data
 * that reading was informed by. Only mentions fields actually present, so a dream
 * logged without extra metadata doesn't get a prompt full of "not specified" noise.
 */
function formatMetadataBlock(m?: RequestMetadata): string {
  if (!m) return '';
  const lines: string[] = [];
  if (m.tone) lines.push(`- Tone the dreamer assigned: ${m.tone}`);
  if (m.lucidity && m.lucidity !== 'none') lines.push(`- Lucidity: ${m.lucidity}`);
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
  if (!lines.length) return '';
  return `\n\nAdditional context the dreamer noted (use this to inform your reading of tone, archetype and themes — the ending in particular shapes the narrative arc the archetype names — do not simply restate it back):\n${lines.join('\n')}`;
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

    // Call Claude claude-sonnet-4-6
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [FORMAT_INTERPRETATION_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: `Please interpret this dream:\n\n${body.description}${formatMetadataBlock(body.metadata)}`,
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
        model_used: 'claude-sonnet-4-6',
        archetype: input.archetype,
        themes: input.themes,
        symbolic_density: input.symbolic_density,
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
