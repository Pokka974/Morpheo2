-- T135: pg_cron setup for periodic maintenance jobs
-- Requires pg_cron extension enabled in Supabase project settings

-- Enable pg_cron (requires superuser; enabled via Supabase dashboard extensions page)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job 1: Reset monthly entitlement counters on the 1st of each month at 00:05 UTC
SELECT cron.schedule(
  'reset-monthly-entitlements',
  '5 0 1 * *', -- At 00:05 on day-of-month 1
  $$
    UPDATE entitlements
    SET
      interpretations_used_this_month = 0,
      image_generations_used_this_month = 0,
      reset_date = date_trunc('month', now() + interval '1 month')
    WHERE reset_date <= now();
  $$
);

-- Job 2: Hard-delete accounts scheduled for deletion (30 days after request)
-- Cascades via FK constraints to delete dreams, interpretations, media, etc.
SELECT cron.schedule(
  'process-account-deletions',
  '0 3 * * *', -- Daily at 03:00 UTC
  $$
    -- Delete media files from Storage before deleting records
    -- (handled by trigger or separate cleanup; Supabase Storage has no CASCADE)
    DELETE FROM auth.users
    WHERE id IN (
      SELECT id FROM profiles
      WHERE deletion_scheduled_at IS NOT NULL
        AND deletion_scheduled_at <= now()
    );
    -- Profile and user data cascade via FK ON DELETE CASCADE
  $$
);

-- Job 3: Expire subscriptions past their expiration date (safety net for missed webhooks)
SELECT cron.schedule(
  'expire-subscriptions',
  '15 0 * * *', -- Daily at 00:15 UTC
  $$
    UPDATE entitlements
    SET tier = 'free'
    WHERE tier = 'premium'
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at < now();

    UPDATE profiles
    SET subscription_tier = 'free'
    WHERE subscription_tier = 'premium'
      AND id IN (
        SELECT user_id FROM entitlements
        WHERE tier = 'free' AND subscription_expires_at < now()
      );
  $$
);
