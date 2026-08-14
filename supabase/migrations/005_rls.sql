-- profiles RLS
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- entitlements RLS (client: SELECT only; service role manages writes)
CREATE POLICY "entitlements_select_own" ON entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- consent_records RLS (client: SELECT only; INSERT via service role from Edge Function)
CREATE POLICY "consent_records_select_own" ON consent_records
  FOR SELECT USING (auth.uid() = user_id);

-- dreams RLS
CREATE POLICY "dreams_select_own" ON dreams
  FOR SELECT USING (auth.uid() = user_id AND is_deleted = FALSE);

CREATE POLICY "dreams_insert_own" ON dreams
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "dreams_update_own" ON dreams
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "dreams_delete_own" ON dreams
  FOR DELETE USING (auth.uid() = user_id);

-- interpretations RLS
CREATE POLICY "interpretations_select_own" ON interpretations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "interpretations_insert_own" ON interpretations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- media RLS
CREATE POLICY "media_select_own" ON media
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "media_insert_own" ON media
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "media_update_own" ON media
  FOR UPDATE USING (auth.uid() = user_id);

-- generation_jobs RLS: SELECT only for owner (client polls job status)
-- No client INSERT/UPDATE/DELETE (service role only)
CREATE POLICY "generation_jobs_select_own" ON generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- recurrence_patterns RLS
CREATE POLICY "recurrence_select_own" ON recurrence_patterns
  FOR SELECT USING (auth.uid() = user_id);

-- system_prompts: no client access (no policy = all denied)
