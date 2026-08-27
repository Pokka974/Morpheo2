// Source-text guards on the generate-image Edge Function. It calls a third-party API from
// inside a request the client waits on synchronously, so the failure modes that matter are
// the ones that produce no logs and no response — the original gpt-image-2 incident was
// exactly that: quality: 'high' ran ~195s median, past Supabase's 150s idle-response timeout,
// and the invocation was killed before it could log anything.
//
// Flux is asynchronous (submit, then poll), which moves that risk into the poll loop, so the
// guards below track the loop's bounds rather than a quality setting.
import * as fs from 'fs';
import * as path from 'path';

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../..', relPath), 'utf8');
}

describe('generate-image Edge Function reliability', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  it('calls Black Forest Labs, not the retired OpenAI image endpoint', () => {
    expect(source).toContain('https://api.bfl.ai/v1/flux-kontext-pro');
    expect(source).not.toContain('api.openai.com');
  });

  it('authenticates with the x-key header Flux expects, never a bearer token', () => {
    expect(source).toContain("'x-key': FLUX_API_KEY");
    expect(source).not.toContain('OPENAI_API_KEY');
  });

  it('bounds the poll loop well inside the 150s platform cutoff', () => {
    expect(source).toContain('const POLL_TIMEOUT_MS = 90_000;');
    // An unbounded `while (true)` here would be killed by the platform with no log at all —
    // the exact shape of the original incident.
    expect(source).toContain('Date.now() < deadline');
  });

  it('guards every outbound fetch with an explicit timeout', () => {
    expect(source).toContain('AbortSignal.timeout');
  });

  it('logs before calling Flux, so a hang is diagnosable instead of leaving zero logs', () => {
    expect(source).toContain('Calling Flux');
  });

  // Both of these were hit for real during the migration and each spent a debugging round
  // trip, because they arrive as an ordinary "generation failed" the user can only retry.
  it('names the two operational failures in the logs instead of burying them', () => {
    expect(source).toContain('submitResponse.status === 402');
    expect(source).toContain('FLUX ACCOUNT OUT OF CREDITS');
    expect(source).toContain('FLUX_API_KEY REJECTED');
  });

  it('maps Flux moderation statuses to safety_blocked rather than a generic failure', () => {
    expect(source).toContain("status === 'Content Moderated'");
    expect(source).toContain("status === 'Request Moderated'");
    expect(source).toContain("error: 'safety_blocked'");
  });

  it('re-rolls the seed on regeneration, so "regenerate" is not the same image again', () => {
    expect(source).toContain('submitBody.seed');
  });

  it('copies the result out of the 10-minute signed URL into our own bucket', () => {
    expect(source).toContain("upload(storagePath, imageBuffer, { contentType: 'image/png'");
  });

  // Unlike interpret, this function used to have no top-level try/catch: an unexpected throw
  // surfaced as an unhandled rejection with no application log.
  it('wraps the handler so an unexpected throw is logged and answered', () => {
    expect(source).toContain("console.error('generate-image edge function error:'");
  });
});

describe('generate-image Edge Function prompt sourcing', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  // The visual prompt is written by the interpretation model (system_prompts v2.0.0) while it
  // still has the dream, its emotions, its archetype and its themes in context. Reading it
  // back here is what makes that worth doing.
  it('prefers the interpretation-authored image_prompt', () => {
    expect(source).toContain("select('image_prompt')");
    expect(source).toContain('interpretationRow?.image_prompt');
  });

  // A dream can be illustrated without ever being interpreted, so zero rows is a valid
  // result, not an error — .single() would turn that into a hard failure.
  it('treats a missing interpretation as a valid zero-row result, not an error', () => {
    expect(source).toContain('.maybeSingle()');
    // No bare `.single()` anywhere the row is genuinely optional — the interpretation lookup,
    // the active-prompt lookup and the previous-media lookup can all legitimately return zero
    // rows, and `.single()` turns each of those into a hard failure.
    expect(source).not.toMatch(/\.limit\(1\)\s*\n\s*\.single\(\)/);
  });

  it('falls back to a description + keywords template when no prompt was authored', () => {
    expect(source).toContain('Key symbols:');
    expect(source).toContain('fallback template');
  });

  it('takes the house art direction from the seeded system prompt, with a code fallback', () => {
    expect(source).toContain('image_prompt_directive');
    expect(source).toContain('FALLBACK_STYLE_DIRECTIVE');
  });
});

describe('generate-image Edge Function regeneration limits', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  // Regression guard: max_regenerations used to be hardcoded to 3 for every
  // user, so a premium account (5 allowed per data-model.md / FR-029) saw the
  // same "2 remaining" a free user would after one regeneration.
  it('derives max_regenerations from subscription_tier instead of hardcoding it', () => {
    expect(source).not.toMatch(/max_regenerations:\s*3\b/);
    expect(source).toContain("entitlement?.subscription_tier === 'premium' ? 5 : 0");
  });

  // Regression guard: each call inserts a new media row rather than updating one
  // in place, so a hardcoded `regeneration_count: isRegeneration ? 1 : 0` never
  // climbed past 1 — the regen limit could never actually be reached, and the
  // "N remaining" the client displays never decreased past the first regenerate.
  it('carries the running regeneration count forward instead of resetting it to 1', () => {
    expect(source).not.toMatch(/regeneration_count:\s*isRegeneration\s*\?\s*1\s*:\s*0/);
    expect(source).toContain('(existingMedia?.regeneration_count ?? 0) + 1');
  });

  it("carries an existing entry's max_regenerations forward on regeneration rather than re-deriving it from the current tier", () => {
    expect(source).toContain('existingMedia?.max_regenerations ??');
  });
});

describe('generate-image Edge Function image credits', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  // Regression guard: the quota gate used to be a SELECT of images_used_this_month, a
  // comparison, and — much later, after the Flux round trip — an UPDATE to used + 1. Two
  // concurrent requests both read N and both wrote N + 1. Migration 012 fixed the identical
  // bug on the interpretation path; the image path kept it until the free limit dropped to
  // one image a month, at which point two taps doubled the allowance.
  it('spends the credit through the atomic RPC, not a read-modify-write', () => {
    expect(source).toContain('consume_image_credit');
    expect(source).not.toMatch(/images_used_this_month:\s*\(/);
  });

  it('refunds the credit when no image is produced', () => {
    expect(source).toContain('refund_image_credit');
    // Every error return routes through `fail`, which refunds first. A bare `return json`
    // after the credit is spent is how a user pays for an image they never received.
    expect(source).toContain('return await fail({');
  });

  it('records which bucket the credit came from so the refund restores the right one', () => {
    // consume_image_credit draws from the monthly allowance first and the one-time welcome
    // credit second (019). Refunding the wrong one would silently convert a lifetime credit
    // into a monthly one, or vice versa.
    expect(source).toContain('p_source');
    expect(source).toContain('creditConsumed = { userId: user.id, source:');
  });

  it('does not charge a monthly image for a regeneration', () => {
    // The entry's own max_regenerations bounds regenerations. Charging a second monthly
    // image would make the feature unreachable for any tier whose monthly limit is one.
    expect(source).toMatch(/if \(!isRegeneration\) \{[\s\S]*?consume_image_credit/);
  });

  it('leaves the premium short-circuit to the RPC rather than re-checking the limit here', () => {
    // The old inline gate had no `subscription_tier === 'premium'` branch, so a premium row
    // that still carried a monthly_image_limit (nothing ever nulls one) was capped.
    expect(source).not.toContain('monthly_image_limit');
  });
});

// Every regeneration used to upload a new PNG and insert a new media row, leaving the
// superseded object and row behind forever: an entry regenerated to the premium limit held
// six PNGs and six rows, five of each unreachable (issue #4).
describe('generate-image Edge Function media cleanup', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  /** Just the cleanup helper, so ordering and error-handling assertions can't be
   * satisfied by unrelated code elsewhere in the file. */
  function cleanupBody(): string {
    const start = source.indexOf('async function cleanUpSupersededMedia');
    const end = source.indexOf('serve(async (req: Request)');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('updates the dream’s existing media row instead of inserting a second one', () => {
    expect(source).toContain(".eq('id', existingMedia.id)");
    // The lookup that feeds the update has to carry the row id and the key it is about to
    // replace — reading only the counters is what made an in-place update impossible.
    expect(source).toContain("select('id, storage_key, regeneration_count, max_regenerations')");
  });

  // `media` has no BEFORE UPDATE trigger, and the client's pull sync pages on
  // `gt('updated_at', cursor)`. An unbumped timestamp makes the regeneration invisible to
  // every other device — the row is updated and never travels.
  it('bumps updated_at by hand on the in-place update', () => {
    expect(source).toMatch(/updated_at: new Date\(\)\.toISOString\(\)/);
  });

  it('removes the superseded storage object rather than orphaning it', () => {
    expect(source).toContain("supabase.storage.from('dream-media').remove(staleKeys)");
  });

  // Rows are the only pointer to their objects: dropping a row before its object is gone
  // makes that object permanently unreachable.
  it('deletes superseded rows only after their objects have been removed', () => {
    const cleanup = cleanupBody();
    const removeAt = cleanup.indexOf('.remove(staleKeys)');
    const deleteAt = cleanup.indexOf('.delete()');
    expect(removeAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(removeAt);
  });

  // The user has already paid a credit and owns the image by this point; a bucket that
  // failed to drop an object is not a reason to fail the request they are waiting on.
  it('never fails the generation over a cleanup error', () => {
    const cleanup = cleanupBody();
    expect(cleanup).toContain('console.error');
    expect(cleanup).not.toContain('fail(');
    expect(cleanup).not.toContain('throw');
  });

  // A regeneration that dies mid-flight must leave the previous image and row intact, so
  // nothing is destroyed until the new row is committed.
  it('runs cleanup strictly after the media row write succeeds', () => {
    const writeCheckAt = source.indexOf('if (writeError || !media)');
    const cleanupCallAt = source.indexOf('await cleanUpSupersededMedia(supabase, {');
    expect(writeCheckAt).toBeGreaterThan(-1);
    expect(cleanupCallAt).toBeGreaterThan(writeCheckAt);
  });

  // FR-031's re-generate-after-edit arrives with isRegeneration unset. Resetting the count
  // there would hand back a full regeneration allowance for the price of an edit.
  it('never resets an existing regeneration count to zero', () => {
    expect(source).not.toMatch(/regeneration_count:\s*0\b/);
    expect(source).toContain('(existingMedia?.regeneration_count ?? 0)');
  });
});
