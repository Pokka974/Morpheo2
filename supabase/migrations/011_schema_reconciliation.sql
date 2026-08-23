-- Reconciles the `profiles` table with data-model.md and with the columns the app
-- and Edge Functions already write to.
--
-- Four columns were specified in data-model.md (or required by shipped code) but never
-- created in 001_auth_extensions.sql. Because PostgREST reports a missing column as an
-- ordinary query error, and the calling sites discarded that error, every one of these
-- failed silently in production:
--
--   subscription_tier             -- written by the RevenueCat webhook + expire-subscriptions cron
--   notification_reminders_enabled -- read/written by Settings > Notifications
--   ai_consent_provider_disclosed  -- specified in data-model.md, not yet surfaced in UI
--   deletion_scheduled_at          -- written by account-delete, read by the deletion cron
--
-- 007_pg_cron.sql additionally referenced `entitlements.tier` and
-- `entitlements.image_generations_used_this_month`, neither of which exists (the real
-- columns are `subscription_tier` and `images_used_this_month`). That file is corrected
-- at source, but its cron jobs were already registered from the broken version, so all
-- three are re-scheduled below. cron.schedule() upserts by job name, making this safe to
-- run against both a fresh and an already-migrated database.

-- ---------------------------------------------------------------------------
-- 1. Missing profiles columns
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'premium')),
  ADD COLUMN IF NOT EXISTS notification_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_consent_provider_disclosed TEXT,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- Backfill the denormalized tier from the source of truth for existing users.
UPDATE profiles p
SET subscription_tier = e.subscription_tier
FROM entitlements e
WHERE e.user_id = p.id
  AND p.subscription_tier IS DISTINCT FROM e.subscription_tier;

-- Supports the daily process-account-deletions job.
CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled
  ON profiles (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Column-level write privileges on profiles
-- ---------------------------------------------------------------------------
-- data-model.md: "subscription_tier is updated only by the entitlement Edge Function
-- (service role key)." 008_grants.sql granted table-level UPDATE to `authenticated`,
-- and profiles_update_own (005_rls.sql) permits any user to update their own row — so
-- once subscription_tier exists, a client could grant itself premium through PostgREST.
--
-- A table-level grant covers every column, including ones added later, so it has to be
-- revoked outright and re-granted per column. deletion_scheduled_at is likewise
-- service-role only: it is set by the account-delete function after phrase confirmation.

REVOKE UPDATE ON profiles FROM authenticated;

GRANT UPDATE (
  interpretation_style,
  ai_consent_granted,
  ai_consent_granted_at,
  ai_consent_provider_disclosed,
  notification_reminders_enabled,
  notification_reminder_time,
  push_token,
  updated_at
) ON profiles TO authenticated;

-- RLS still restricts these writes to the user's own row; the column grant restricts
-- which fields that row exposes. Make the row restriction explicit on the write side
-- too — without WITH CHECK, only the USING clause is applied to the post-update row.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 3. Re-schedule the pg_cron jobs registered from the broken 007
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'reset-monthly-entitlements',
  '5 0 1 * *', -- At 00:05 on day-of-month 1
  $$
    UPDATE entitlements
    SET
      interpretations_used_this_month = 0,
      images_used_this_month = 0,
      reset_date = date_trunc('month', now() + interval '1 month')
    WHERE reset_date <= now();
  $$
);

SELECT cron.schedule(
  'process-account-deletions',
  '0 3 * * *', -- Daily at 03:00 UTC
  $$
    DELETE FROM auth.users
    WHERE id IN (
      SELECT id FROM profiles
      WHERE deletion_scheduled_at IS NOT NULL
        AND deletion_scheduled_at <= now()
    );
  $$
);

SELECT cron.schedule(
  'expire-subscriptions',
  '15 0 * * *', -- Daily at 00:15 UTC
  $$
    UPDATE profiles
    SET subscription_tier = 'free'
    WHERE subscription_tier = 'premium'
      AND id IN (
        SELECT user_id FROM entitlements
        WHERE subscription_tier = 'premium'
          AND subscription_expires_at IS NOT NULL
          AND subscription_expires_at < now()
      );

    UPDATE entitlements
    SET subscription_tier = 'free'
    WHERE subscription_tier = 'premium'
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at < now();
  $$
);
