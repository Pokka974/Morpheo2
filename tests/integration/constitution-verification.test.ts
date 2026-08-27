// T133: Verify implementation satisfies Morpheo Constitution principles
import * as fs from 'fs';
import * as path from 'path';

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../', relPath), 'utf8');
}

function fileExists(relPath: string): boolean {
  try {
    fs.accessSync(path.resolve(__dirname, '../../', relPath));
    return true;
  } catch {
    return false;
  }
}

describe('Morpheo Constitution Verification (T133)', () => {
  describe('Principle I — User Data Privacy', () => {
    it('AI calls go through server-side Edge Functions (never direct from client)', () => {
      const interpService = readFile(
        'src/services/ai/interpretation/ClaudeInterpretationService.ts'
      );
      expect(interpService).toContain('functions.invoke');
      expect(interpService).not.toContain('anthropic.messages.create');
    });
  });

  describe('Principle II — Non-clinical framing', () => {
    it('system_prompts seed contains non-clinical framing language', () => {
      const seed = readFile('supabase/seed/system_prompts.sql');
      expect(seed).toContain('non-clinical');
    });
  });

  describe('Principle III — do_not_train for Luma (H1 fix)', () => {
    it('generate-video Edge Function includes do_not_train: true', () => {
      const source = readFile('supabase/functions/generate-video/index.ts');
      expect(source).toContain('do_not_train: true');
    });
  });

  describe('Principle IV — Adapter pattern for all external services', () => {
    it('all 8 service interfaces defined', () => {
      const interfaces = [
        'src/services/auth/AuthService.ts',
        'src/services/auth/LocalLockService.ts',
        'src/services/ai/interpretation/InterpretationService.ts',
        'src/services/ai/image/ImageGenerationService.ts',
        'src/services/ai/video/VideoGenerationService.ts',
        'src/services/storage/StorageService.ts',
        'src/services/entitlement/EntitlementService.ts',
        'src/services/notifications/NotificationService.ts',
      ];
      interfaces.forEach(iface => {
        expect(fileExists(iface)).toBe(true);
      });
    });

    it('concrete implementations exist for all 8 services', () => {
      const impls = [
        'src/services/auth/SupabaseAuthService.ts',
        'src/services/auth/ExpoLocalLockService.ts',
        'src/services/ai/interpretation/ClaudeInterpretationService.ts',
        'src/services/ai/image/FluxImageGenerationService.ts',
        'src/services/ai/video/LumaVideoGenerationService.ts',
        'src/services/storage/ExpoStorageService.ts',
        'src/services/subscription/RevenueCatEntitlementService.ts',
        'src/services/notifications/ExpoNotificationService.ts',
      ];
      impls.forEach(impl => {
        expect(fileExists(impl)).toBe(true);
      });
    });
  });

  describe('Principle V — Server-side entitlement gating', () => {
    it('interpret Edge Function checks entitlement server-side', () => {
      const source = readFile('supabase/functions/interpret/index.ts');
      // The limit check and the increment happen in one statement inside
      // consume_interpretation_credit (012_entitlement_credit_rpc.sql) so concurrent
      // requests cannot both pass a read-then-write check.
      expect(source).toContain('consume_interpretation_credit');
      expect(source).toContain('Limit exceeded');

      const rpc = readFile('supabase/migrations/012_entitlement_credit_rpc.sql');
      expect(rpc).toContain('monthly_interpretation_limit');
      expect(rpc).toContain('interpretations_used_this_month + 1');
    });

    it('interpret refunds the credit when no interpretation is produced', () => {
      const source = readFile('supabase/functions/interpret/index.ts');
      expect(source).toContain('refund_interpretation_credit');
    });

    it('usage counters are not writable by the client', () => {
      const rpc = readFile('supabase/migrations/012_entitlement_credit_rpc.sql');
      expect(rpc).toContain('REVOKE ALL ON FUNCTION consume_interpretation_credit');
      expect(rpc).toContain(
        'GRANT EXECUTE ON FUNCTION consume_interpretation_credit(UUID) TO service_role'
      );
    });

    it('generate-image Edge Function checks entitlement server-side', () => {
      const source = readFile('supabase/functions/generate-image/index.ts');
      expect(source).toContain('entitlements');
      // Same one-statement check-and-increment as the interpretation path, for the same
      // reason (019_image_credit_rpc.sql).
      expect(source).toContain('consume_image_credit');

      const rpc = readFile('supabase/migrations/019_image_credit_rpc.sql');
      expect(rpc).toContain('monthly_image_limit');
      expect(rpc).toContain('images_used_this_month + 1');
      // The one-time welcome image is spent only after the month's allowance.
      expect(rpc).toContain('bonus_image_credits');
    });

    it('generate-image refunds the credit when no image is produced', () => {
      const source = readFile('supabase/functions/generate-image/index.ts');
      expect(source).toContain('refund_image_credit');
    });

    it('image usage counters are not writable by the client', () => {
      const rpc = readFile('supabase/migrations/019_image_credit_rpc.sql');
      expect(rpc).toContain('REVOKE ALL ON FUNCTION consume_image_credit');
      expect(rpc).toContain('REVOKE ALL ON FUNCTION refund_image_credit');
      expect(rpc).toContain('GRANT EXECUTE ON FUNCTION consume_image_credit(UUID) TO service_role');
      expect(rpc).toContain(
        'GRANT EXECUTE ON FUNCTION refund_image_credit(UUID, TEXT) TO service_role'
      );
    });

    it('the one-time welcome image is not refilled by the monthly reset cron', () => {
      // cron.schedule stores its command string unparsed, so a job body that picked up
      // bonus_image_credits would schedule cleanly and then hand every free user a second
      // free image on the 1st of every month, forever, with nothing failing.
      const cron = readFile('supabase/migrations/007_pg_cron.sql');
      const reconciliation = readFile('supabase/migrations/011_schema_reconciliation.sql');
      expect(cron).not.toContain('bonus_image_credits');
      expect(reconciliation).not.toContain('bonus_image_credits');
    });

    it('generate-video Edge Function checks premium entitlement server-side', () => {
      const source = readFile('supabase/functions/generate-video/index.ts');
      expect(source).toContain('premium_required');
      expect(source).toContain("tier !== 'premium'");
    });
  });

  describe('Principle VI — SQLite-compatible queries (H2 fix)', () => {
    it('journal filter uses json_each not PostgreSQL @> syntax', () => {
      const source = readFile('src/features/journal/useJournalFilters.ts');
      expect(source).toContain('json_each');
      expect(source).not.toContain('@>');
    });
  });

  describe('Principle VII — Account deletion uses exact phrase (C1 fix)', () => {
    it('account-delete Edge Function uses DELETE MY ACCOUNT', () => {
      const source = readFile('supabase/functions/account-delete/index.ts');
      expect(source).toContain("'DELETE MY ACCOUNT'");
    });

    it('delete-account screen uses same phrase', () => {
      const source = readFile('src/app/(main)/settings/delete-account.tsx');
      expect(source).toContain("'DELETE MY ACCOUNT'");
    });
  });

  describe('Principle VIII — Idle timeout reads correct key (C2 fix)', () => {
    it('useIdleTimeout reads from lock_idle_timeout_minutes AsyncStorage key', () => {
      const source = readFile('src/features/auth/useIdleTimeout.ts');
      expect(source).toContain('lock_idle_timeout_minutes');
      expect(source).not.toContain('notification_reminder_time');
    });
  });

  describe('Principle IX — Voice dictation uses correct library (C3 fix)', () => {
    it('DreamLogScreen uses @react-native-voice/voice not expo-speech', () => {
      const source = readFile('src/app/(main)/log/index.tsx');
      expect(source).toContain('@react-native-voice/voice');
    });
  });

  describe('Principle X — getCacheSize is non-destructive (H4 fix)', () => {
    it('StorageService interface has getCacheSize method', () => {
      const source = readFile('src/services/storage/StorageService.ts');
      expect(source).toContain('getCacheSize(): Promise<number>');
    });

    it('settings screen uses getCacheSize not evictToLimit(0)', () => {
      const source = readFile('src/app/(main)/settings/index.tsx');
      expect(source).toContain('getCacheSize');
      expect(source).not.toContain('evictToLimit(0)');
    });
  });

  describe('Principle XI — generation_jobs SELECT RLS (H3 fix)', () => {
    it('RLS migration includes SELECT policy for generation_jobs owner', () => {
      const source = readFile('supabase/migrations/005_rls.sql');
      expect(source).toContain('generation_jobs');
      expect(source).toContain('SELECT');
    });
  });
});
