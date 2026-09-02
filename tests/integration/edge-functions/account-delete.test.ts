// Source-text guards on the account deletion Edge Function.
//
// The manual QA pass in #2 ran this function against the local stack and found the global
// sign-out failing on every single call: `admin.signOut` was handed `user.id`, and GoTrue
// answered `invalid JWT: ... token contains an invalid number of segments`. The branch that
// catches it is deliberately non-fatal, so the failure only ever reached a log line while the
// function returned `200 { scheduled: true }`. Nothing in the suite could see it, because the
// argument is type-correct — both are strings. Hence these guards.
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('account-delete Edge Function', () => {
  const source = readFile('supabase/functions/account-delete/index.ts');

  describe('C1 — the confirmation phrase', () => {
    it('is the exact contract string', () => {
      expect(source).toContain("const REQUIRED_CONFIRMATION = 'DELETE MY ACCOUNT'");
      expect(source).toContain('confirmation !== REQUIRED_CONFIRMATION');
    });

    it('is compared without trimming or case folding', () => {
      // A `.trim()` or `.toUpperCase()` here would accept " delete my account" and break
      // the contract the client types against.
      expect(source).not.toMatch(/confirmation[^;\n]*\.trim\(\)/);
      expect(source).not.toMatch(/confirmation[^;\n]*\.toUpperCase\(\)/);
      expect(source).not.toMatch(/confirmation[^;\n]*\.toLowerCase\(\)/);
    });
  });

  describe('scheduling', () => {
    it('schedules the hard delete 30 days out', () => {
      expect(source).toContain('scheduledAt.getDate() + 30');
      expect(source).toContain('deletion_scheduled_at');
    });

    it('answers a failed write with a 5xx rather than a silent success', () => {
      expect(source).toContain('schedule_failed');
      expect(source).toMatch(/schedule_failed'[\s\S]{0,80}status: 500/);
    });

    it('persists the deletion before signing anyone out', () => {
      // A signed-out user cannot retry, so the write has to land first.
      expect(source.indexOf('deletion_scheduled_at')).toBeLessThan(
        source.indexOf('auth.admin.signOut')
      );
    });
  });

  describe('global sign-out', () => {
    it('is handed the caller JWT, which is what admin.signOut authenticates with', () => {
      expect(source).toContain("auth.admin.signOut(accessToken, 'global')");
      expect(source).toContain('authHeader.replace(');
    });

    it('is never handed a user id, which GoTrue rejects as a malformed token', () => {
      expect(source).not.toContain('signOut(user.id');
    });

    it('logs its own failure, since the branch is deliberately not fatal', () => {
      expect(source).toContain('Global sign-out after deletion scheduling failed');
    });
  });
});
