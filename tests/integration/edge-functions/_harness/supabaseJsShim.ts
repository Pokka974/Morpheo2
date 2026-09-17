// Stands in for `https://esm.sh/@supabase/supabase-js@2` (mapped in jest.config.js). An Edge
// Function may call `createClient(...)` more than once per request (a service-role client and
// a per-request anon client authenticated with the caller's JWT) — both calls return the same
// scripted fake client, since these tests care about the function's own logic, not which of
// its two client instances happened to make a given call.
import { createFakeSupabaseClient, type SupabaseScript } from './fakeSupabaseClient';

let currentScript: SupabaseScript | null = null;
let singleton: ReturnType<typeof createFakeSupabaseClient> | null = null;

/** Configures (or reconfigures) the fake client every subsequent `createClient()` call returns. */
export function __setSupabaseScript(script: SupabaseScript): void {
  currentScript = script;
  singleton = null;
}

export function createClient(): ReturnType<typeof createFakeSupabaseClient> {
  if (!currentScript) {
    throw new Error('supabaseJsShim: call __setSupabaseScript() before the handler runs');
  }
  if (!singleton) {
    singleton = createFakeSupabaseClient(currentScript);
  }
  return singleton;
}
