-- Adds the AI-generated archetype/themes/symbolic-density metadata the redesigned dream
-- detail screen's "Généré par Morpheo" block shows, and widens recurrence_patterns so
-- themes can be tracked as a fourth recurrence dimension alongside keywords, emotions
-- and cultural references — the data behind the new "Nth {theme} dream this month"
-- section, which is deliberately AI-detected (via themes) rather than a client-side
-- keyword string-match.

ALTER TABLE interpretations
  ADD COLUMN IF NOT EXISTS archetype TEXT,
  ADD COLUMN IF NOT EXISTS themes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS symbolic_density SMALLINT
    CHECK (symbolic_density BETWEEN 1 AND 4);

-- 008_grants.sql grants interpretations table-wide to `authenticated`, which covers
-- columns added later; RLS still restricts every write to the user's own row. No new
-- grant is needed here, same reasoning 013/015 already used.

-- Widen the pattern_type CHECK to add 'theme'. The constraint name is looked up rather
-- than hardcoded — there is no precedent for DROP CONSTRAINT in this repo's migrations,
-- and schema-contract.test.ts's own doc comment exists precisely because past
-- guessed-at names shipped broken.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'recurrence_patterns'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%pattern_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE recurrence_patterns DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE recurrence_patterns
  ADD CONSTRAINT recurrence_patterns_pattern_type_check
  CHECK (pattern_type IN ('keyword', 'emotion', 'cultural_reference', 'theme'));

-- Recurrence pattern computation after each interpretation INSERT — same trigger as
-- 006_triggers.sql, redefined to add a fourth loop over NEW.themes (a text[], same
-- shape as the existing keywords/emotions loops, not the cultural_references JSONB one).
CREATE OR REPLACE FUNCTION update_recurrence_patterns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  kw TEXT;
  em TEXT;
  th TEXT;
  ref JSONB;
BEGIN
  -- Keywords
  FOREACH kw IN ARRAY NEW.keywords LOOP
    INSERT INTO recurrence_patterns (id, user_id, symbol, pattern_type, occurrence_count, first_seen_at, last_seen_at)
    VALUES (gen_random_uuid(), NEW.user_id, kw, 'keyword', 1, NOW(), NOW())
    ON CONFLICT (user_id, symbol, pattern_type)
    DO UPDATE SET
      occurrence_count = recurrence_patterns.occurrence_count + 1,
      last_seen_at = NOW(),
      updated_at = NOW();
  END LOOP;

  -- Emotions
  FOREACH em IN ARRAY NEW.emotions LOOP
    INSERT INTO recurrence_patterns (id, user_id, symbol, pattern_type, occurrence_count, first_seen_at, last_seen_at)
    VALUES (gen_random_uuid(), NEW.user_id, em, 'emotion', 1, NOW(), NOW())
    ON CONFLICT (user_id, symbol, pattern_type)
    DO UPDATE SET
      occurrence_count = recurrence_patterns.occurrence_count + 1,
      last_seen_at = NOW(),
      updated_at = NOW();
  END LOOP;

  -- Cultural references
  FOR ref IN SELECT * FROM jsonb_array_elements(NEW.cultural_references) LOOP
    INSERT INTO recurrence_patterns (id, user_id, symbol, pattern_type, occurrence_count, first_seen_at, last_seen_at)
    VALUES (gen_random_uuid(), NEW.user_id, ref->>'symbol', 'cultural_reference', 1, NOW(), NOW())
    ON CONFLICT (user_id, symbol, pattern_type)
    DO UPDATE SET
      occurrence_count = recurrence_patterns.occurrence_count + 1,
      last_seen_at = NOW(),
      updated_at = NOW();
  END LOOP;

  -- Themes
  FOREACH th IN ARRAY NEW.themes LOOP
    INSERT INTO recurrence_patterns (id, user_id, symbol, pattern_type, occurrence_count, first_seen_at, last_seen_at)
    VALUES (gen_random_uuid(), NEW.user_id, th, 'theme', 1, NOW(), NOW())
    ON CONFLICT (user_id, symbol, pattern_type)
    DO UPDATE SET
      occurrence_count = recurrence_patterns.occurrence_count + 1,
      last_seen_at = NOW(),
      updated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (still fires AFTER INSERT ON interpretations), only the
-- function body above changed — no DROP/CREATE TRIGGER needed.

COMMENT ON COLUMN interpretations.archetype IS
  'The dominant Jungian/narrative archetype Claude identified for this dream, e.g. "The Seeker".';
COMMENT ON COLUMN interpretations.themes IS
  'AI-identified recurring symbolic themes (distinct from the literal keywords column) — feeds the theme-type rows in recurrence_patterns.';
COMMENT ON COLUMN interpretations.symbolic_density IS
  '1 (literal, few symbols) to 4 (highly symbolic, densely layered).';
