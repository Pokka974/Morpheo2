// Stands in for `https://esm.sh/@anthropic-ai/sdk@...` (mapped in jest.config.js). Both
// `interpret` and `generate-image` share one Anthropic instance for two different calls — the
// content-safety screen (`screen_text`) and, in `interpret`, the interpretation itself
// (`format_interpretation`) — so responses are scripted by tool name rather than call order.
export type AnthropicScript = Record<string, jest.Mock>;

let currentScript: AnthropicScript | null = null;

export function __setAnthropicScript(script: AnthropicScript): void {
  currentScript = script;
}

interface CreateParams {
  tools?: Array<{ name: string }>;
}

export default class Anthropic {
  constructor(_opts: unknown) {}

  messages = {
    create: async (params: CreateParams) => {
      const toolName = params.tools?.[0]?.name;
      const handler = toolName ? currentScript?.[toolName] : undefined;
      if (!handler) {
        throw new Error(
          `anthropicSdkShim: no scripted response for tool "${String(toolName)}" — ` +
            'call __setAnthropicScript() with an entry for it.'
        );
      }
      return handler(params);
    },
  };
}
