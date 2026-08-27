# Morpheo — CLAUDE.md

AI dream interpretation app for iOS and Android. Solo-built, portfolio-grade.

## Stack

- **React Native / Expo SDK 53+** (managed workflow) — TypeScript strict mode
- **Expo Router v4** — file-based navigation (`(auth)/`, `(main)/`)
- **Supabase** — PostgreSQL + Auth + Storage + Edge Functions + Realtime
- **Claude Haiku 4.5** (`claude-haiku-4-5`) — text interpretation via `tool_use` (`format_interpretation`)
- **Black Forest Labs FLUX.1 Kontext [pro]** — image generation (submit + poll, inside one Edge Function invocation)
- **Luma Dream Machine v2** — async video generation (**postponed — no UI; backend dormant**)
- **RevenueCat** — cross-platform IAP
- **expo-sqlite + drizzle-orm** — offline-first local persistence
- **Zustand** (planned) — global state

## Project Structure

```
src/
  app/           # Expo Router screens
    (auth)/      # Onboarding, sign-in, lock
    (main)/      # Journal, log, insights, settings
  features/      # Feature-based modules
  services/      # Adapter interfaces + concrete implementations
  shared/        # Design tokens, components
  db/            # Drizzle schema + SQLite client
  supabase/      # Supabase client + secure store adapter
supabase/
  functions/     # Edge Functions (Deno)
  migrations/    # SQL migrations (001–012)
  seed/          # system_prompts.sql
tests/
  unit/          # Jest unit tests
  integration/   # Integration tests
  e2e/           # Detox/Maestro E2E
```

## Critical Constraints (from speckit-analyze remediation)

| # | Constraint | Detail |
|---|-----------|--------|
| C1 | Account deletion phrase | Exact string `DELETE MY ACCOUNT` — matches Edge Function contract |
| C2 | Idle timeout key | `AsyncStorage` key `lock_idle_timeout_minutes` — NOT `profiles.notification_reminder_time` |
| C3 | Voice dictation | `@react-native-voice/voice` for STT — NOT `expo-speech` (TTS-only) |
| H1 | Luma training opt-out | `{ "do_not_train": true }` MUST be included in every Luma API call |
| H2 | SQLite emotion filter | `json_each()` subquery — NOT PostgreSQL `@>` array syntax |
| H3 | generation_jobs RLS | SELECT policy for owner — enables client polling |
| H4 | Cache size query | `getCacheSize(): Promise<number>` — NOT `evictToLimit(0)` (destructive) |

## Design System (binding for all UI work)

The app has one visual system, ported from the "Morpheo : système de design onirique"
Claude Design project. **Dark is the only theme** — these are not overrides of a light
default, they are the palette.

**`src/theme/tokens.ts` is the single source of truth.** Colours, spacing, radii,
typography, gradients, glows and touch targets all live there and nowhere else.

Rules, enforced by ESLint as **errors** (not warnings):

- **No hardcoded values.** `react-native/no-color-literals` and
  `no-inline-styles` fail the build. A raw hex anywhere outside `tokens.ts` is a
  lint error. If a value is missing, *add it to the tokens* — never inline it.
- **Build from the existing components** before writing new markup:
  `Button` / `ActionButton`, `Chip` / `ChipRow`, `Card`, `DreamCard`, `TabBar`,
  `EmptyState`, `ErrorState`, `LoadingState` / `SkeletonCard`.
- **Two families, one rule.** Fraunces carries the dream — its title, its narrative
  and the AI's voice. Everything interactive stays in Manrope. Use the `typography.*`
  styles rather than assembling `fontFamily` + `fontSize` by hand.
- **Elevation is light, never shadow.** Use `glow.soft` / `glow.action` /
  `glow.highlight`; no drop shadows, and `tokens.test.ts` asserts zero offset.
- **Amber (`colors.highlight`) is reserved** for positive emotions and the lucid-dream
  marker. Never for a destructive action.
- **Icons are drawn**, never emoji or dingbats — inline `react-native-svg` on a 24px
  grid, stroked, inheriting palette colours.
- **Accessibility is a gate, not a polish pass.** `tests/unit/theme/contrast.test.ts`
  asserts WCAG AA (4.5:1) for every text/surface pairing and every emotion chip; a
  token edit that drops below AA fails CI. Interactive targets hold
  `MIN_TOUCH_TARGET` (44px). No datum is ever carried by colour alone — the
  constellation labels every star with its term and count.
- **All user-facing copy goes through i18n.** `useTranslation()` + a key in
  `src/i18n/locales/{en,fr}.json`. Never a literal string in a component;
  `locales.test.ts` enforces key parity and matching interpolation placeholders
  across both languages.

## Service Adapter Pattern

All 8 external integrations are behind TypeScript interfaces in `src/services/`.
Feature code always uses `useServices()` hook — never imports concrete classes directly.
`ServicesProvider` in `_layout.tsx` injects concrete implementations at app startup.

## Development Commands

```bash
npm install               # Install dependencies
npx expo start            # Start dev server
npx expo run:ios          # Run on iOS simulator
npx expo run:android      # Run on Android emulator
npm test                  # Run Jest tests
npm run typecheck         # TypeScript check
npm run lint              # ESLint
```

## Definition of Done

Every code change must satisfy all of the following before it's considered complete:

- **Lint** — `npm run lint` passes with no new errors/warnings
- **Typecheck** — `npm run typecheck` passes (TypeScript strict mode)
- **Error handling** — failure paths are handled explicitly: no silently
  swallowed errors, no `.single()` where a zero-row result is valid (use
  `.maybeSingle()` instead), no unhandled promise rejections
- **Schema contract** — every column named in a `.select()`, `.eq()`,
  `.insert()` or `.update()` must exist in `supabase/migrations/`. Prefer an
  explicit column list over `select('*')`, since `*` plus bracket access hides
  name drift from `tests/integration/schema-contract.test.ts`. A PostgREST
  query naming a missing column fails at runtime but passes every mocked test
- **Unit tests** — new or changed behavior has a corresponding test in
  `tests/unit/`, and `npm test` passes
- **Constraint compliance** — re-check the Critical Constraints table
  (C1-C3, H1-H4) whenever a change touches related code
- **Service adapter pattern** — new or changed external integrations stay
  behind a `src/services/` interface, consumed only via `useServices()`,
  never by importing a concrete class directly
- **Design system** — any UI change consumes `src/theme/tokens.ts` and the shared
  components; no hardcoded colours, spacing or type, and all copy through i18n
  (see the Design System section above)

## Environment Variables

Copy `.env.example` to `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_REVENUECAT_IOS_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
```

Edge Function secrets (set via `supabase secrets set`):
- `ANTHROPIC_API_KEY`
- `FLUX_API_KEY`
- `LUMA_API_KEY` (unused while video is postponed)
- `REVENUECAT_WEBHOOK_AUTH_HEADER`

## Supabase Local Development

```bash
supabase start            # Start local Supabase
supabase db reset         # Replay 001..N from scratch, then the seed files
npm run db:verify         # db reset + execute every cron.job body (what CI runs)
supabase functions serve  # Serve Edge Functions locally
```

`supabase/config.toml` lists `seed/system_prompts.sql` and `storage.sql` under
`[db.seed]`, so `db reset` applies both — there is no separate seed command.

The `Migrations` workflow runs the same two steps on every PR touching `supabase/**`
(it drives the CLI and `psql` directly, so it needs no Node install).
`cron.schedule()` stores its command string without parsing it, so a job body naming a
dropped column schedules cleanly and then fails every night in production; that is why
`supabase/ci/run_cron_jobs.sql` executes each body once, inside a transaction it rolls
back.

## Architecture Decisions

- **Offline-first**: SQLite as primary store; sync queue drains on network reconnect
- **Server-side gates**: Entitlement checks in Edge Functions are the actual gate; client-side checks are UX only
- **System prompt versioning**: `system_prompts` table, server-side only; no client access
- **LWW sync**: `last_modified_at` timestamp for last-write-wins conflict resolution
- **200MB cache cap**: `ExpoStorageService.evictToLimit(200MB)` called on every foreground transition

## Key Files

| File | Purpose |
|------|---------|
| `src/theme/tokens.ts` | **Design tokens — the only place raw values live** |
| `src/theme/useAppFonts.ts` | Manrope + Fraunces loading gate |
| `src/i18n/locales/{en,fr}.json` | All user-facing copy |
| `src/shared/components/` | Button, Chip, Card, TabBar, SettingsRow/Section, icons, state components |
| `src/features/recurrence/ConstellationChart.tsx` | Theme co-occurrence graph — pinch/pan via the SVG viewBox (react-native-svg) |
| `src/features/recurrence/EmotionRibbon.tsx` | Emotional tone **over the selected period** — not a night arc; there is no per-hour emotion data |
| `src/features/recurrence/SleepClarityBars.tsx` | Mean dream clarity per sleep-quality rating (react-native-svg) |
| `tests/unit/theme/contrast.test.ts` | WCAG AA gate on every token pairing |
| `src/app/_layout.tsx` | Root layout, service wiring, lock gate, cache eviction |
| `src/services/ServicesProvider.tsx` | React context for service injection |
| `src/services/registry.ts` | ServiceRegistry type |
| `src/db/schema.ts` | Drizzle ORM SQLite schema |
| `src/db/client.ts` | SQLite singleton |
| `supabase/functions/interpret/index.ts` | Claude Haiku 4.5 interpretation Edge Function — also authors each dream's Flux `image_prompt` |
| `supabase/functions/generate-image/index.ts` | FLUX.1 Kontext [pro] image Edge Function — submit, poll, copy into `dream-media` |
| `supabase/seed/system_prompts.sql` | **The interpretation prompt and the Flux art direction — both versioned data, not code** |
| `supabase/migrations/005_rls.sql` | All RLS policies |
| `supabase/migrations/006_triggers.sql` | Signup bootstrap + recurrence trigger |
| `supabase/migrations/007_pg_cron.sql` | Monthly reset + deletion cleanup + expiry |
| `supabase/migrations/011_schema_reconciliation.sql` | Missing `profiles` columns; column-level write grants |
| `supabase/migrations/012_entitlement_credit_rpc.sql` | Atomic interpretation-credit consume/refund |
| `supabase/migrations/017_flux_image_prompt.sql` | `interpretations.image_prompt` + `system_prompts.image_prompt_directive` |
| `tests/integration/schema-contract.test.ts` | Asserts every queried column exists in the migrations |
| `specs/001-morpheo-app/` | Full specification, plan, tasks |
| `.specify/memory/constitution.md` | Morpheo governance constitution |
