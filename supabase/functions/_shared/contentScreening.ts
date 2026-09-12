import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.120.0';

/**
 * Same model as `interpret` (claude-haiku-4-5): this call is a cheap yes/no classification,
 * not a reasoning task, so there is no reason to pay for a larger tier here.
 */
const SCREENING_MODEL = 'claude-haiku-4-5';

const SCREEN_TEXT_TOOL: Anthropic.Tool = {
  name: 'screen_text',
  description: 'Classify whether a piece of text violates content policy.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      blocked: {
        type: 'boolean',
        description:
          'true only if the text requests, depicts in first person as instruction, or solicits: ' +
          'sexual content involving minors, real-world instructions for serious violence or weapon ' +
          'construction, or content that promotes/glorifies self-harm or suicide. ' +
          'A dream narrative that merely *describes* disturbing imagery (violence, death, monsters, ' +
          'nudity, fear) as something dreamed is ordinary dream content and must never be blocked.',
      },
    },
    required: ['blocked'],
  },
} as Anthropic.Tool;

/**
 * Pre-dispatch text screening shared by `interpret` and `generate-image`: the only screen
 * either function had before this was Flux rejecting the *derived* image prompt as a side
 * effect, which never covered the raw dream text sent to Claude, nor a dream illustrated
 * without ever being interpreted (FR-014, issue #12).
 *
 * Fails open: a screening-call outage must not take down interpretation or image generation
 * for every dream. The two callers still have Claude's/Flux's own moderation as a second layer.
 */
export async function screenDreamText(anthropic: Anthropic, text: string): Promise<boolean> {
  try {
    const message = await anthropic.messages.create({
      model: SCREENING_MODEL,
      max_tokens: 32,
      tools: [SCREEN_TEXT_TOOL],
      tool_choice: { type: 'tool', name: 'screen_text' },
      messages: [{ role: 'user', content: text.slice(0, 4000) }],
    });

    const toolUse = message.content.find(b => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return false;

    const input = toolUse.input as { blocked?: boolean };
    return input.blocked === true;
  } catch (err) {
    console.error('Content screening call failed, allowing dispatch:', err);
    return false;
  }
}
