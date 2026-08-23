-- The redesigned dream-log screen captures two things the schema had no room for:
-- the emotions the dreamer felt (until now emotions existed only on `interpretations`,
-- i.e. as the AI's reading) and the lucid-dream marker.
--
-- Both are additive and defaulted, so every existing row stays valid and the
-- offline-first sync keeps working against clients that predate this migration.

ALTER TABLE dreams
  ADD COLUMN IF NOT EXISTS emotions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_lucid BOOLEAN NOT NULL DEFAULT FALSE;

-- 008_grants.sql grants dreams table-wide to `authenticated`, which covers columns
-- added later; RLS still restricts every write to the user's own row. No new grant
-- is needed here — unlike `profiles`, which 011 pinned to a per-column grant list.

COMMENT ON COLUMN dreams.emotions IS
  'Emotions selected by the dreamer at log time. Distinct from interpretations.emotions, which is the AI reading.';
COMMENT ON COLUMN dreams.is_lucid IS
  'The dreamer marked this dream as lucid. Rendered with the amber highlight, the only other use of that hue.';
