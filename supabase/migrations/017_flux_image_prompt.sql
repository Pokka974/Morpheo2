-- Moves image generation from OpenAI gpt-image-2 to Black Forest Labs flux-kontext-pro,
-- and with it the source of the image prompt. Rather than a template literal assembled
-- inside the generate-image Edge Function from `description` + `keywords`, the prompt is
-- now authored by the interpretation model itself: it already has the dream, the dreamer's
-- metadata, the emotions, the archetype and the themes in context when it fills in
-- format_interpretation, so the visual prompt costs one extra tool field rather than a
-- second model call.
--
-- Both columns are nullable on purpose. Every interpretation written before this migration
-- has no image_prompt (generate-image falls back to the deterministic template for those),
-- and the 1.0.0 system_prompts row predates image_prompt_directive.

ALTER TABLE interpretations
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;

ALTER TABLE system_prompts
  ADD COLUMN IF NOT EXISTS image_prompt_directive TEXT;

-- No new grants. 008_grants.sql grants `interpretations` table-wide to `authenticated`,
-- which covers columns added later, and RLS still restricts every write to the user's own
-- row — the same reasoning 013/015/016 already used. `system_prompts` stays service-role
-- only (005_rls.sql: RLS enabled with no policy), so the directive is never client-readable.

COMMENT ON COLUMN interpretations.image_prompt IS
  'English text-to-image prompt the interpretation model wrote for this dream, consumed by the generate-image Edge Function. NULL for interpretations produced before prompt version 2.0.0.';
COMMENT ON COLUMN system_prompts.image_prompt_directive IS
  'House art-direction suffix appended to every Flux prompt (medium, palette, negative constraints). Versioned alongside the interpretation prompt so image style is tunable by re-seeding rather than redeploying an Edge Function.';
