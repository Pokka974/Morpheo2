## What and why

<!-- What changed, and the reason it needed changing. Cite files as `path:line`. -->

Closes #

## Definition of Done

From `CLAUDE.md`. Every box is a gate, not a suggestion — strike through with a one-line
reason anything genuinely not applicable, rather than leaving it blank.

- [ ] **Lint** — `npm run lint` passes with no new errors/warnings, and `npm run format:check` is clean
- [ ] **Typecheck** — `npm run typecheck` passes (TypeScript strict mode)
- [ ] **Error handling** — failure paths are handled explicitly: no silently swallowed
      errors, no `.single()` where a zero-row result is valid (use `.maybeSingle()`),
      no unhandled promise rejections
- [ ] **Schema contract** — every column named in a `.select()`, `.eq()`, `.insert()` or
      `.update()` exists in `supabase/migrations/`, and the query uses an explicit column
      list rather than `select('*')`. A PostgREST query naming a missing column fails at
      runtime but passes every mocked test
- [ ] **Unit tests** — new or changed behaviour has a test in `tests/unit/`, and `npm test` passes
- [ ] **Constraint compliance** — re-checked the Critical Constraints table (C1-C3, H1-H4)
      against everything this touches
- [ ] **Service adapter pattern** — new or changed external integrations stay behind a
      `src/services/` interface, consumed only via `useServices()`, never by importing a
      concrete class
- [ ] **Design system** — UI consumes `src/theme/tokens.ts` and the shared components; no
      hardcoded colours, spacing or type; icons drawn as `react-native-svg`, never emoji

## Copy

- [ ] Every user-facing string goes through `useTranslation()` with a key in **both**
      `src/i18n/locales/en.json` and `fr.json` — `locales.test.ts` enforces key parity
      and matching interpolation placeholders
- [ ] N/A — this PR adds no user-facing copy

## Migrations

Only if this touches `supabase/**`. The `Migrations` workflow runs the first two on every
such PR.

- [ ] `supabase db reset` replays 001..N plus the seed files from scratch without error
- [ ] `npm run db:verify` passes — every `cron.job` body still executes, since
      `cron.schedule()` stores its command unparsed and a job naming a dropped column
      schedules cleanly and then fails nightly in production
- [ ] Applied to the remote project, or explicitly deferred and noted below
- [ ] N/A — no migration in this PR

## Verification

<!-- What you actually ran or saw: test output, a simulator run, a screenshot of the
     changed screen in dark. Not "should work". -->
