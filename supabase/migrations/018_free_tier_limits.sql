-- Free-tier repricing.
--
-- The free tier shipped at 5 interpretations and 5 images per month, which made the
-- Haiku + Flux bill scale with users who were never going to convert. The new policy:
--
--   AI interpretation   3 / month              premium: unlimited
--   Image generation    the first one ever
--                       + 1 / month            premium: unlimited
--   Regenerations       0 per entry            premium: 5
--
-- "The first one ever" is a one-time welcome credit -- a brand-new account can see the
-- app's flagship feature immediately instead of waiting for the 1st of the month --
-- so the signup month allows two images and every month after allows one.
--
-- Premium rows are deliberately left alone: unlimited comes from the
-- subscription_tier = 'premium' short-circuit in consume_image_credit /
-- consume_interpretation_credit, not from nulling these columns. Nothing in the
-- RevenueCat webhook ever touched them, so a row that upgrades keeps whatever numbers
-- it had and the short-circuit is what makes it unlimited.

ALTER TABLE entitlements ALTER COLUMN monthly_interpretation_limit SET DEFAULT 3;
ALTER TABLE entitlements ALTER COLUMN monthly_image_limit SET DEFAULT 1;

-- The one-time welcome image.
--
-- IMPORTANT: this column is intentionally absent from the reset-monthly-entitlements
-- cron body (007_pg_cron.sql, re-scheduled in 011). It is a lifetime credit, not a
-- monthly one -- adding it to that UPDATE alongside images_used_this_month would hand
-- every free user a second free image every month, which is the whole thing this
-- migration is trying not to do.
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS bonus_image_credits INTEGER NOT NULL DEFAULT 1;

-- Existing free rows still carrying the old defaults move to the new ones. Scoped by
-- both tier and the exact old value so a row that was adjusted by hand -- a support
-- grant, a beta tester -- keeps its allowance.
UPDATE entitlements
SET monthly_interpretation_limit = 3
WHERE subscription_tier = 'free' AND monthly_interpretation_limit = 5;

UPDATE entitlements
SET monthly_image_limit = 1
WHERE subscription_tier = 'free' AND monthly_image_limit = 5;

-- ADD COLUMN gave the welcome credit to everybody, including accounts that have already
-- generated images under the old 5/month allowance. Those have had their first one.
UPDATE entitlements e
SET bonus_image_credits = 0
WHERE EXISTS (
  SELECT 1 FROM media m
  WHERE m.user_id = e.user_id AND m.media_type = 'image'
);

-- Free regenerations go to zero. Three regenerations on top of one image a month is
-- four Flux calls per free user per month, which would leave the cost exactly where it
-- was. The generate-image Edge Function supplies this value explicitly on every insert
-- (premium ? 5 : 0), so the default only covers a direct write; it is changed here so
-- the schema does not still claim 3.
--
-- Existing media rows are deliberately NOT backfilled: the Edge Function carries an
-- entry's allowance forward across regenerations precisely so a mid-cycle change never
-- retroactively shrinks an in-progress entry.
ALTER TABLE media ALTER COLUMN max_regenerations SET DEFAULT 0;
