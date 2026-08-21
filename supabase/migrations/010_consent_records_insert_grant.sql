-- Client writes consent_records directly (onboarding consent, ConsentPromptModal,
-- Settings > Privacy withdraw/grant) but 008_grants.sql only granted SELECT to
-- authenticated, leaving these inserts silently failing. RLS is enabled on this
-- table (008_grants.sql) with only a SELECT policy (005_rls.sql), so an INSERT
-- policy is required in addition to the GRANT — RLS denies by default when no
-- policy matches the command.
GRANT INSERT ON consent_records TO authenticated;

CREATE POLICY "consent_records_insert_own" ON consent_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);
