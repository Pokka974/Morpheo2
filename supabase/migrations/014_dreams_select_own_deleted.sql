-- The owner's own SELECT was excluding is_deleted rows at the RLS layer, which meant
-- a client-side pull sync could never learn a dream had been deleted (soft-deleted
-- rows are invisible to the client's own query regardless of what it asks for).
-- "Show only active dreams" is already enforced at the query layer everywhere the
-- app reads dreams, so RLS no longer needs to also enforce it.
DROP POLICY IF EXISTS "dreams_select_own" ON dreams;
CREATE POLICY "dreams_select_own" ON dreams
  FOR SELECT USING (auth.uid() = user_id);
