-- Auto-create profiles + entitlements row on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.entitlements (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Recurrence pattern computation after each interpretation INSERT
CREATE OR REPLACE FUNCTION update_recurrence_patterns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  kw TEXT;
  em TEXT;
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_interpretation_created ON interpretations;
CREATE TRIGGER on_interpretation_created
  AFTER INSERT ON interpretations
  FOR EACH ROW EXECUTE FUNCTION update_recurrence_patterns();
