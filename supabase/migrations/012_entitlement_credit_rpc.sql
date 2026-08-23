-- Atomic interpretation-credit consumption.
--
-- The interpret Edge Function previously did a read-modify-write across an await
-- boundary: SELECT interpretations_used_this_month, compare against the limit, then
-- later UPDATE to used + 1. Two concurrent requests both read N and both write N + 1,
-- so a free-tier user can exceed the monthly limit by running requests in parallel.
-- The comment there claimed the sequence was atomic; it was not.
--
-- A single conditional UPDATE makes the check and the increment one statement, with the
-- row lock held for its duration.

CREATE OR REPLACE FUNCTION consume_interpretation_credit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE entitlements
  SET interpretations_used_this_month = interpretations_used_this_month + 1
  WHERE user_id = p_user_id
    AND (
      subscription_tier = 'premium'
      OR monthly_interpretation_limit IS NULL
      OR interpretations_used_this_month < monthly_interpretation_limit
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Returns the credit when the interpretation could not be produced (AI provider error,
-- failed insert). Floors at zero so a double refund cannot drive the counter negative.
CREATE OR REPLACE FUNCTION refund_interpretation_credit(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE entitlements
  SET interpretations_used_this_month = GREATEST(interpretations_used_this_month - 1, 0)
  WHERE user_id = p_user_id;
$$;

-- Edge Functions only: the client must never be able to move its own usage counters.
REVOKE ALL ON FUNCTION consume_interpretation_credit(UUID) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION refund_interpretation_credit(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION consume_interpretation_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION refund_interpretation_credit(UUID) TO service_role;
