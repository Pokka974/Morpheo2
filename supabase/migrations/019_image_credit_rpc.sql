-- Atomic image-credit consumption.
--
-- The same defect 012 fixed for interpretations was still live on the image path: the
-- generate-image Edge Function read images_used_this_month, compared it to the limit,
-- and only incremented after the Flux call returned. Two concurrent requests both read
-- N and both wrote N + 1. At the old limit of 5 that was a rounding error; at a limit of
-- 1 it doubles the free allowance with two taps.
--
-- That gate also had no premium short-circuit, unlike every other gate in the codebase.
-- Since nothing ever nulls a premium row's monthly_image_limit, a paying user was capped
-- at whatever number their row happened to carry. The short-circuit lives here now, so
-- there is one place it can be got right.
--
-- Unlike consume_interpretation_credit this returns TEXT rather than BOOLEAN, because
-- there are two buckets and the refund has to put the credit back in the one it came
-- from.

CREATE OR REPLACE FUNCTION consume_image_credit(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Monthly allowance first, so the one-time welcome credit survives until the month's
  -- image is actually spent. Draining the bonus first would silently consume the thing
  -- the user was saving.
  UPDATE entitlements
  SET images_used_this_month = images_used_this_month + 1
  WHERE user_id = p_user_id
    AND (
      subscription_tier = 'premium'
      OR monthly_image_limit IS NULL
      OR images_used_this_month < monthly_image_limit
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RETURN 'monthly';
  END IF;

  -- Monthly allowance spent: fall back to the one-time welcome credit (018).
  UPDATE entitlements
  SET bonus_image_credits = bonus_image_credits - 1
  WHERE user_id = p_user_id
    AND bonus_image_credits > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    RETURN 'bonus';
  END IF;

  RETURN 'denied';
END;
$$;

-- Returns the credit when no image could be produced (Flux error, failed upload, failed
-- media insert). p_source is the string consume_image_credit returned, so the credit
-- goes back where it came from; anything else is a no-op, which makes a double refund
-- after the Edge Function has already cleared its handle harmless.
CREATE OR REPLACE FUNCTION refund_image_credit(p_user_id UUID, p_source TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source = 'monthly' THEN
    UPDATE entitlements
    SET images_used_this_month = GREATEST(images_used_this_month - 1, 0)
    WHERE user_id = p_user_id;
  ELSIF p_source = 'bonus' THEN
    UPDATE entitlements
    SET bonus_image_credits = bonus_image_credits + 1
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- Edge Functions only: the client must never be able to move its own usage counters.
REVOKE ALL ON FUNCTION consume_image_credit(UUID) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION refund_image_credit(UUID, TEXT) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION consume_image_credit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION refund_image_credit(UUID, TEXT) TO service_role;
