// Regression guard for the gpt-image-2 504 timeout incident: quality: 'high' has a
// median generation latency (~195s, p95 ~280s) well past Supabase's 150s
// idle-response timeout, which kills the invocation with zero application logs
// since the function never gets past the fetch call to log anything.
import * as fs from 'fs';
import * as path from 'path';

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../..', relPath), 'utf8');
}

describe('generate-image Edge Function reliability', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  it('uses quality: medium, not high, to stay inside the Supabase 150s response window', () => {
    expect(source).toContain("quality: 'medium'");
    expect(source).not.toContain("quality: 'high'");
  });

  it('guards the OpenAI call with an explicit timeout, comfortably under the 150s platform cutoff', () => {
    expect(source).toContain('AbortSignal.timeout');
  });

  it('logs before calling OpenAI, so a hang is diagnosable instead of leaving zero logs', () => {
    expect(source).toContain('Calling OpenAI gpt-image-2');
  });
});

describe('generate-image Edge Function regeneration limits', () => {
  const source = readFile('supabase/functions/generate-image/index.ts');

  // Regression guard: max_regenerations used to be hardcoded to 3 for every
  // user, so a premium account (5 allowed per data-model.md / FR-029) saw the
  // same "2 remaining" a free user would after one regeneration.
  it('derives max_regenerations from subscription_tier instead of hardcoding it', () => {
    expect(source).not.toMatch(/max_regenerations:\s*3\b/);
    expect(source).toContain("entitlement?.subscription_tier === 'premium' ? 5 : 3");
  });

  // Regression guard: each call inserts a new media row rather than updating one
  // in place, so a hardcoded `regeneration_count: isRegeneration ? 1 : 0` never
  // climbed past 1 — the regen limit could never actually be reached, and the
  // "N remaining" the client displays never decreased past the first regenerate.
  it('carries the running regeneration count forward instead of resetting it to 1', () => {
    expect(source).not.toMatch(/regeneration_count:\s*isRegeneration\s*\?\s*1\s*:\s*0/);
    expect(source).toContain('(existingMedia?.regeneration_count ?? 0) + 1');
  });

  it('carries an existing entry\'s max_regenerations forward on regeneration rather than re-deriving it from the current tier', () => {
    expect(source).toContain('existingMedia?.max_regenerations ??');
  });
});
