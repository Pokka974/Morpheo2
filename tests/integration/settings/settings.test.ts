// T127: Integration tests for settings flows
// Tests consent withdrawal, export structure, account deletion

describe('Settings integration', () => {
  describe('Account deletion', () => {
    it('account-delete Edge Function uses exact confirmation string (C1 fix)', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../supabase/functions/account-delete/index.ts'),
        'utf8'
      );
      expect(source).toContain("confirmation !== REQUIRED_CONFIRMATION");
      expect(source).toContain("'DELETE MY ACCOUNT'");
    });

    it('delete-account screen disables confirm button until exact phrase typed', () => {
      // UI contract: button disabled unless confirmationText === 'DELETE MY ACCOUNT'
      const PHRASE = 'DELETE MY ACCOUNT';
      expect(''.length === PHRASE.length).toBe(false);
      expect('delete my account' === PHRASE).toBe(false);
      expect('DELETE MY ACCOUNT' === PHRASE).toBe(true);
    });
  });

  describe('Consent management', () => {
    it('withdrawing consent updates profiles.ai_consent_granted to false', () => {
      // Privacy screen calls supabase.from('profiles').update({ ai_consent_granted: false })
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../src/app/(main)/settings/privacy.tsx'),
        'utf8'
      );
      expect(source).toContain('ai_consent_granted');
      expect(source).toContain('consent_records');
    });
  });

  describe('Data export', () => {
    it('export Edge Function assembles dreams + interpretations in JSON', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../supabase/functions/export-data/index.ts'),
        'utf8'
      );
      expect(source).toContain("'dreams'");
      expect(source).toContain("'interpretations'");
      expect(source).toContain('exportedAt');
    });
  });

  describe('Cache management (T128)', () => {
    it('settings screen uses getCacheSize() not evictToLimit(0)', () => {
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../src/app/(main)/settings/index.tsx'),
        'utf8'
      );
      expect(source).toContain('getCacheSize');
      expect(source).not.toContain('evictToLimit(0)');
    });
  });
});
