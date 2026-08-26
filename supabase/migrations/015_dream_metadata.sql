-- The redesigned log-dream screen adds a second layer of metadata beyond emotions
-- and the lucid marker: sleep timing and quality, the dream's own clarity/tone/
-- ending, who and where it involved, a link to an earlier dream it continues, and
-- a set of AI-suggestible type tags. All additive and nullable/defaulted, so every
-- existing row stays valid and offline-first sync keeps working against clients
-- that predate this migration.
--
-- `day_stress` and `presleep_substances` — the "Contexte personnel" block — are
-- deliberately NOT added here. The design marks that block private: never sent to
-- the AI, never exported. It lives only in local SQLite (see src/db/client.ts) and
-- never reaches this table.

ALTER TABLE dreams
  ADD COLUMN IF NOT EXISTS bedtime TIME,
  ADD COLUMN IF NOT EXISTS wake_time TIME,
  ADD COLUMN IF NOT EXISTS sleep_quality SMALLINT CHECK (sleep_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS clarity SMALLINT CHECK (clarity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS lucidity TEXT NOT NULL DEFAULT 'none'
    CHECK (lucidity IN ('none', 'semi', 'lucid', 'full')),
  ADD COLUMN IF NOT EXISTS tone TEXT CHECK (tone IN ('positive', 'neutral', 'negative', 'mixed')),
  ADD COLUMN IF NOT EXISTS dream_ending TEXT
    CHECK (dream_ending IN ('resolved', 'unresolved', 'fragmented')),
  ADD COLUMN IF NOT EXISTS dream_type TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS characters TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS places TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_dream_id UUID REFERENCES dreams(id) ON DELETE SET NULL;

-- 008_grants.sql grants dreams table-wide to `authenticated`, which covers columns
-- added later; RLS still restricts every write to the user's own row. No new grant
-- is needed here, same as 013.

CREATE INDEX IF NOT EXISTS idx_dreams_linked_dream_id ON dreams(linked_dream_id)
  WHERE linked_dream_id IS NOT NULL;

COMMENT ON COLUMN dreams.lucidity IS
  'Replaces the old boolean-only lucid marker with four levels; is_lucid stays as a derived convenience flag (true for lucid/full) so existing badges and queries keep working.';
COMMENT ON COLUMN dreams.linked_dream_id IS
  'Set when the dreamer marks this dream as a continuation of an earlier one, forming a recurrence chain surfaced in Insights.';
COMMENT ON COLUMN dreams.dream_type IS
  'Free-form type tags (e.g. recurring, nightmare). Chosen by the dreamer at log time; not AI-generated in this version.';
