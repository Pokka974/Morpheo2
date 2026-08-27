// Source-text guards on the RevenueCat webhook Edge Function.
//
// This function sat in the repo undeployed for months, and neither reason was visible from
// its body: it was nested one level too deep for the CLI's slug derivation to find it, and
// nothing declared verify_jwt = false, so the gateway would have rejected RevenueCat's
// shared-secret Authorization header with a 401 before the handler ever ran. Both are
// layout/config facts rather than behaviour, so both are asserted here alongside the
// request handling — a future move or a dropped config stanza silently un-deploys it again.
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('revenuecat-webhook Edge Function', () => {
  const source = readFile('supabase/functions/revenuecat-webhook/index.ts');

  describe('deployability', () => {
    it('sits one level under functions/, where the CLI derives slugs from', () => {
      expect(fs.existsSync(path.join(ROOT, 'supabase/functions/revenuecat-webhook/index.ts'))).toBe(
        true
      );
      // The old nested path is exactly why `supabase functions deploy` never saw it.
      expect(fs.existsSync(path.join(ROOT, 'supabase/functions/webhooks'))).toBe(false);
    });

    it('is declared with verify_jwt disabled, since the shared secret is not a JWT', () => {
      const config = readFile('supabase/config.toml');
      const stanza = /\[functions\.revenuecat-webhook\]([\s\S]*?)(?=\n\[|$)/.exec(config);
      expect(stanza).not.toBeNull();
      expect(stanza![1]).toContain('verify_jwt = false');
    });
  });

  describe('request handling', () => {
    it('rejects anything but POST instead of falling through to req.json()', () => {
      expect(source).toContain("req.method !== 'POST'");
      expect(source).toContain('method_not_allowed');
    });

    it('compares the shared secret in constant time and rejects an unset secret', () => {
      expect(source).toContain('function secretsMatch');
      expect(source).toContain('diff = a.length ^ b.length');
      // `expected` empty must not authenticate a request sending an empty header.
      expect(source).toContain('if (!expected || received === null) return false;');
    });

    it('answers malformed JSON with a 400, not a 5xx retry loop', () => {
      expect(source).toContain('await req.json()');
      expect(source).toContain('invalid_json');
      expect(source).toMatch(/try \{[\s\S]*await req\.json\(\)[\s\S]*\} catch/);
    });

    it('sets Content-Type on every response, so callers can parse the body', () => {
      expect(source).toContain("'Content-Type': 'application/json'");
      // Every JSON response goes through the `json()` helper — the only place that
      // serializes a body is the helper itself, so no path can skip the header.
      expect(source.match(/JSON\.stringify/g)).toHaveLength(1);
    });
  });

  describe('entitlement writes', () => {
    it('moves entitlements and profiles together', () => {
      expect(source).toContain("from('entitlements')");
      expect(source).toContain("from('profiles')");
      expect(source).toContain('subscription_tier: tier');
      // entitlements is keyed on user_id, profiles on id — a mismatch writes nothing.
      expect(source).toContain("eq('user_id', appUserId)");
      expect(source).toContain("eq('id', appUserId)");
    });

    it('maps only the events that change tier, leaving CANCELLATION alone', () => {
      expect(source).toContain("eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL'");
      expect(source).toContain("eventType === 'EXPIRATION'");
      expect(source).not.toContain("=== 'CANCELLATION'");
    });

    it('returns 5xx on a failed write, so RevenueCat resends the event', () => {
      expect(source).toContain('entitlement_update_failed');
      expect(source).toMatch(/entitlement_update_failed'\s*\},?\s*500/);
    });

    it('surfaces a zero-row update, which PostgREST does not report as an error', () => {
      expect(source).toContain(".select('user_id')");
      expect(source).toContain('updatedRows.length === 0');
      expect(source).toContain('RevenueCat webhook matched no entitlements row');
    });

    it('short-circuits a non-uuid app_user_id before it becomes a PostgREST type error', () => {
      // Verified against the local stack: `.eq('user_id', '$RCAnonymousID:abc123')` returns
      // `invalid input syntax for type uuid`, which the error branch turns into a 500 —
      // an infinite RevenueCat retry on an event that can never succeed. Until #43 wires
      // Purchases.logIn, that is the id every real purchase arrives with.
      expect(source).toContain('UUID_RE.test(appUserId)');
      expect(source).toContain('RevenueCat webhook received a non-uuid app_user_id');
    });
  });
});
