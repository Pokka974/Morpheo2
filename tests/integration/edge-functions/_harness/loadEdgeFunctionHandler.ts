import path from 'path';
import { __takeHandler } from './denoServeShim';

type Handler = (req: Request) => Promise<Response> | Response;

// Placeholder values only — every real network/DB call these would configure is shimmed, so
// nothing reads them for their content. `revenuecat-webhook` is the one exception: its shared
// secret is compared for real inside `secretsMatch`, so tests that exercise it pass their own
// value as an override.
const DEFAULT_ENV: Record<string, string> = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  SUPABASE_ANON_KEY: 'anon-test-key',
  ANTHROPIC_API_KEY: 'anthropic-test-key',
  FLUX_API_KEY: 'flux-test-key',
  REVENUECAT_WEBHOOK_AUTH_HEADER: 'test-webhook-secret',
};

/**
 * Requires an Edge Function module and returns the handler it registers via `serve()`.
 *
 * Only needs to run once per test file (its module-level `Deno.env.get(...)` constants are
 * read exactly once, at this require) — the shimmed `createClient`/`Anthropic` read their
 * *current* test script on every call rather than capturing one at import time, so the same
 * handler instance stays valid to reuse and reconfigure across every test in the file.
 */
export function loadEdgeFunctionHandler(name: string, env: Record<string, string> = {}): Handler {
  Object.assign(process.env, DEFAULT_ENV, env);
  (globalThis as unknown as { Deno: { env: { get(key: string): string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
  const modulePath = path.join(__dirname, '../../../../supabase/functions', name, 'index.ts');
  require(modulePath);
  return __takeHandler();
}
