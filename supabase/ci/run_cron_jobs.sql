-- CI-only: execute the body of every scheduled pg_cron job exactly once.
--
-- cron.schedule() stores its command as an opaque string and never parses it, so a job
-- referencing a dropped column schedules cleanly and then fails silently every night in
-- production. Migration 007 shipped three such statements. Running the bodies here is the
-- only way the pipeline can see them.
--
-- Everything runs inside a transaction that is rolled back, so this asserts the SQL is
-- valid against the real schema without leaving rows behind.

BEGIN;

DO $ci$
DECLARE
  job       record;
  job_count integer;
BEGIN
  SELECT count(*) INTO job_count FROM cron.job;

  IF job_count = 0 THEN
    RAISE EXCEPTION
      'No pg_cron jobs are scheduled — 007_pg_cron.sql registered nothing, so this check is vacuous';
  END IF;

  RAISE NOTICE 'Executing % scheduled cron job body(ies)', job_count;

  FOR job IN SELECT jobid, jobname, command FROM cron.job ORDER BY jobid LOOP
    RAISE NOTICE '  -> % (jobid %)', job.jobname, job.jobid;
    EXECUTE job.command;
  END LOOP;
END
$ci$;

-- Executing a job body only proves its SQL is valid against the schema. It says nothing
-- about whether the statement does what the job is named for -- a WHERE clause that
-- matches nothing, or a SET list that has quietly lost a column, runs perfectly.
--
-- reset-monthly-entitlements is asserted properly below because it is the one job whose
-- correctness is a pricing question: 018_free_tier_limits.sql turns on bonus_image_credits
-- being a *lifetime* credit, and the failure it warns about -- adding that column to this
-- job's SET list -- would hand every free user an extra image every month while still
-- executing cleanly. Nothing but an effect assertion catches that.
--
-- The command is read back from cron.job rather than copied from the migration, so this
-- tests what is actually scheduled.

DO $reset$
DECLARE
  reset_cmd      text;
  due_user       uuid := '00000000-0000-0000-0000-0000000000d1';
  unspent_user   uuid := '00000000-0000-0000-0000-0000000000d2';
  pending_user   uuid := '00000000-0000-0000-0000-0000000000f2';
  expected_reset date := (date_trunc('month', now() + interval '1 month'))::date;
  pending_reset  date := (now() + interval '10 days')::date;
  e              entitlements%ROWTYPE;
BEGIN
  SELECT command INTO reset_cmd FROM cron.job WHERE jobname = 'reset-monthly-entitlements';

  IF reset_cmd IS NULL THEN
    RAISE EXCEPTION
      'No cron job named reset-monthly-entitlements -- it was renamed or never scheduled';
  END IF;

  -- handle_new_user() (006_triggers.sql) bootstraps the profiles and entitlements rows,
  -- so inserting the auth user is the whole seed.
  INSERT INTO auth.users (id) VALUES (due_user), (unspent_user), (pending_user);

  -- Due: reset_date has come round, both counters spent.
  --
  -- bonus_image_credits is seeded at 0 -- an account that has already used its welcome
  -- image, which is the state 018's own backfill writes. Seeding it at 1 would make this
  -- assertion untestable: the bug being guarded against sets the column *to 1*, so a
  -- fixture already holding 1 passes whether the job touches it or not.
  UPDATE entitlements
  SET interpretations_used_this_month = 3,
      images_used_this_month          = 1,
      bonus_image_credits             = 0,
      reset_date                      = date_trunc('month', now())::date
  WHERE user_id = due_user;

  -- Also due, but the welcome image was never used -- someone who signed up mid-month and
  -- is now hitting their first reset. The credit is theirs to keep. This row is what makes
  -- the revoke direction reachable at all: on due_user the column is already 0, so a job
  -- that zeroes it is a no-op there and only a fixture holding 1 can catch it.
  UPDATE entitlements
  SET interpretations_used_this_month = 1,
      images_used_this_month          = 1,
      bonus_image_credits             = 1,
      reset_date                      = date_trunc('month', now())::date
  WHERE user_id = unspent_user;

  -- Not due: mid-cycle, must be left completely alone.
  UPDATE entitlements
  SET interpretations_used_this_month = 2,
      images_used_this_month          = 1,
      bonus_image_credits             = 1,
      reset_date                      = pending_reset
  WHERE user_id = pending_user;

  EXECUTE reset_cmd;

  -- The due row: both counters zeroed, reset_date advanced a month.
  SELECT * INTO e FROM entitlements WHERE user_id = due_user;

  IF e.interpretations_used_this_month <> 0 THEN
    RAISE EXCEPTION 'reset left interpretations_used_this_month at %, expected 0',
      e.interpretations_used_this_month;
  END IF;

  IF e.images_used_this_month <> 0 THEN
    RAISE EXCEPTION 'reset left images_used_this_month at %, expected 0',
      e.images_used_this_month;
  END IF;

  IF e.reset_date <> expected_reset THEN
    RAISE EXCEPTION 'reset left reset_date at %, expected %', e.reset_date, expected_reset;
  END IF;

  -- The 018 regression guard. See that migration's comment on bonus_image_credits.
  IF e.bonus_image_credits <> 0 THEN
    RAISE EXCEPTION
      'reset granted bonus_image_credits back (now %) -- it is a lifetime credit, and a '
      'monthly job handing it out again gives every free user an extra image every month '
      '(018_free_tier_limits.sql)', e.bonus_image_credits;
  END IF;

  -- The due-but-unspent row: reset like any other, but the lifetime credit survives.
  SELECT * INTO e FROM entitlements WHERE user_id = unspent_user;

  IF e.interpretations_used_this_month <> 0 OR e.images_used_this_month <> 0 THEN
    RAISE EXCEPTION 'reset left a due row''s counters at %/%, expected 0/0',
      e.interpretations_used_this_month, e.images_used_this_month;
  END IF;

  IF e.bonus_image_credits <> 1 THEN
    RAISE EXCEPTION
      'reset revoked an unspent bonus_image_credits (now %) -- a user who never used their '
      'welcome image must keep it across a monthly reset (018_free_tier_limits.sql)',
      e.bonus_image_credits;
  END IF;

  -- The not-due row: untouched, which is what proves the WHERE clause still selects.
  SELECT * INTO e FROM entitlements WHERE user_id = pending_user;

  IF e.interpretations_used_this_month <> 2
     OR e.images_used_this_month <> 1
     OR e.reset_date <> pending_reset THEN
    RAISE EXCEPTION
      'reset touched a row whose reset_date has not come round (used %/%, reset_date %)',
      e.interpretations_used_this_month, e.images_used_this_month, e.reset_date;
  END IF;

  IF e.bonus_image_credits <> 1 THEN
    RAISE EXCEPTION
      'reset revoked an unspent bonus_image_credits (now %)', e.bonus_image_credits;
  END IF;

  RAISE NOTICE 'reset-monthly-entitlements: counters zeroed, reset_date advanced to %, '
    'bonus_image_credits preserved, mid-cycle row untouched', expected_reset;
END
$reset$;

-- expire-subscriptions is the safety net for a webhook RevenueCat never delivered, or
-- delivered and we failed to write. It is the only path by which a lapsed subscriber is
-- ever downgraded without an external event, so "it executes" is a particularly weak
-- thing to know about it: every way it can be wrong leaves valid SQL behind.
--
-- Three properties, each of which fails silently:
--
--   * It must move BOTH tables. entitlements is the source of truth and
--     profiles.subscription_tier is a denormalised copy that RLS reads (data-model.md);
--     a downgrade that lands in one leaves a lapsed user premium wherever the other is
--     consulted.
--   * The two UPDATEs are order-dependent. profiles is updated first, selecting its rows
--     through a subquery over entitlements. Swap them and entitlements is already 'free'
--     by the time the subquery runs, so it matches nothing and profiles keeps a premium
--     tier forever -- with both statements still executing cleanly.
--   * `subscription_expires_at IS NOT NULL` is load-bearing. A premium row with a null
--     expiry is one the webhook has not written an expiry to yet; dropping that guard
--     downgrades every one of them on the next nightly run.
--
-- Read back from cron.job for the same reason the reset is: 011_schema_reconciliation.sql
-- re-schedules this job, so the migration file is not the authority on what runs.

DO $expire$
DECLARE
  expire_cmd    text;
  lapsed_user   uuid := '00000000-0000-0000-0000-0000000000e1';
  active_user   uuid := '00000000-0000-0000-0000-0000000000e2';
  no_expiry     uuid := '00000000-0000-0000-0000-0000000000e3';
  active_until  timestamptz := now() + interval '10 days';
  e             entitlements%ROWTYPE;
  p_tier        text;
BEGIN
  SELECT command INTO expire_cmd FROM cron.job WHERE jobname = 'expire-subscriptions';

  IF expire_cmd IS NULL THEN
    RAISE EXCEPTION
      'No cron job named expire-subscriptions -- it was renamed or never scheduled';
  END IF;

  INSERT INTO auth.users (id) VALUES (lapsed_user), (active_user), (no_expiry);

  -- Lapsed: premium in both tables, expiry a day in the past. The one row the job exists
  -- for.
  UPDATE entitlements
  SET subscription_tier       = 'premium',
      subscription_expires_at = now() - interval '1 day'
  WHERE user_id = lapsed_user;
  UPDATE profiles SET subscription_tier = 'premium' WHERE id = lapsed_user;

  -- Paying, mid-term. Must be left alone -- this is what proves the WHERE still
  -- discriminates rather than downgrading the whole premium table.
  UPDATE entitlements
  SET subscription_tier       = 'premium',
      subscription_expires_at = active_until
  WHERE user_id = active_user;
  UPDATE profiles SET subscription_tier = 'premium' WHERE id = active_user;

  -- Premium with no expiry recorded. Also must be left alone, and for a different
  -- reason: this is a live subscriber whose renewal date the webhook has not written,
  -- not a lapsed one. Only a fixture shaped like this can catch a dropped IS NOT NULL.
  UPDATE entitlements
  SET subscription_tier       = 'premium',
      subscription_expires_at = NULL
  WHERE user_id = no_expiry;
  UPDATE profiles SET subscription_tier = 'premium' WHERE id = no_expiry;

  EXECUTE expire_cmd;

  -- The lapsed row, entitlements half.
  SELECT * INTO e FROM entitlements WHERE user_id = lapsed_user;

  IF e.subscription_tier <> 'free' THEN
    RAISE EXCEPTION
      'expire-subscriptions left a lapsed entitlements row at % (expired %) -- the safety '
      'net for a missed RevenueCat webhook did not fire',
      e.subscription_tier, e.subscription_expires_at;
  END IF;

  -- The lapsed row, profiles half. This assertion is the ordering guard: if the two
  -- UPDATEs are ever swapped, entitlements above still reads 'free' and only this fails.
  SELECT subscription_tier INTO p_tier FROM profiles WHERE id = lapsed_user;

  IF p_tier <> 'free' THEN
    RAISE EXCEPTION
      'expire-subscriptions downgraded entitlements but left profiles.subscription_tier '
      'at % -- the denormalised copy RLS reads is now out of step, which is what happens '
      'if the profiles UPDATE stops running before the entitlements one', p_tier;
  END IF;

  -- The paying mid-term row: untouched in both tables.
  SELECT * INTO e FROM entitlements WHERE user_id = active_user;
  SELECT subscription_tier INTO p_tier FROM profiles WHERE id = active_user;

  IF e.subscription_tier <> 'premium' OR p_tier <> 'premium' THEN
    RAISE EXCEPTION
      'expire-subscriptions downgraded a subscription that runs until % '
      '(entitlements %, profiles %)', active_until, e.subscription_tier, p_tier;
  END IF;

  IF e.subscription_expires_at <> active_until THEN
    RAISE EXCEPTION 'expire-subscriptions moved subscription_expires_at from % to %',
      active_until, e.subscription_expires_at;
  END IF;

  -- The null-expiry row: untouched in both tables.
  SELECT * INTO e FROM entitlements WHERE user_id = no_expiry;
  SELECT subscription_tier INTO p_tier FROM profiles WHERE id = no_expiry;

  IF e.subscription_tier <> 'premium' OR p_tier <> 'premium' THEN
    RAISE EXCEPTION
      'expire-subscriptions downgraded a premium row with no subscription_expires_at '
      '(entitlements %, profiles %) -- a null expiry means the webhook has not written a '
      'renewal date, not that the subscription has lapsed. Dropping the IS NOT NULL guard '
      'downgrades every such subscriber on the next nightly run', e.subscription_tier, p_tier;
  END IF;

  RAISE NOTICE 'expire-subscriptions: lapsed row downgraded in both tables, '
    'mid-term and null-expiry subscriptions untouched';
END
$expire$;

ROLLBACK;
