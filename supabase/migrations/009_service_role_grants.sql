-- service_role has rolbypassrls = true (skips RLS policies) but Postgres still
-- requires explicit table-level GRANTs independently of RLS. 008_grants.sql only
-- granted the `authenticated` role, leaving service_role (used by every Edge
-- Function) with no privileges on any app table at all.
GRANT ALL ON profiles TO service_role;
GRANT ALL ON entitlements TO service_role;
GRANT ALL ON consent_records TO service_role;
GRANT ALL ON dreams TO service_role;
GRANT ALL ON interpretations TO service_role;
GRANT ALL ON media TO service_role;
GRANT ALL ON generation_jobs TO service_role;
GRANT ALL ON recurrence_patterns TO service_role;
GRANT ALL ON system_prompts TO service_role;
