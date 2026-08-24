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
