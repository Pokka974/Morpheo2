// Stands in for `https://deno.land/std@.../http/server.ts` (mapped in jest.config.js).
// Every Edge Function calls `serve(handler)` exactly once at module load — this captures
// that handler instead of starting a listener, so a test can invoke it directly.
type Handler = (req: Request) => Promise<Response> | Response;

let registered: Handler | null = null;

export function serve(handler: Handler): void {
  registered = handler;
}

/** Reads the handler registered by the most recent `require()` of an Edge Function module. */
export function __takeHandler(): Handler {
  if (!registered) {
    throw new Error('denoServeShim: serve() was never called — did the module import correctly?');
  }
  const handler = registered;
  registered = null;
  return handler;
}
