# Tasks: Morpheo — AI Dream Interpretation App

**Input**: Design documents from `specs/001-morpheo-app/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Testing**: Tests are included alongside each feature phase per constitution Principle II
("no feature is done without tests"). AI adapters are always tested via mocks; live API
calls are prohibited in CI.

**Organization**: Phases 1–2 are foundational. Phases 3–7 cover all P1 user stories
(must be complete before P2 begins). Phases 8–10 cover P2. Phase 11 covers P3.
Final phase covers cross-cutting polish.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependency)
- **[Story]**: Which user story this task belongs to (US1–US9)
- **[PREREQ]**: External account or API key required — must complete before tasks that depend on it

---

## Phase 1: Project Setup

**Purpose**: Initialize the Expo project, toolchain, and CI so every subsequent task
starts from a known, consistent baseline.

- [X] T001 Initialize Expo project with TypeScript strict mode: `npx create-expo-app morpheo --template expo-template-blank-typescript`; set `"strict": true` in `tsconfig.json`; verify `tsc --noEmit` passes
- [X] T002 Install and configure Expo Router in `src/app/`: create `(auth)/` and `(main)/` route groups, `_layout.tsx` root layout with `<Stack>`, and `index.tsx` redirect to `(auth)/onboarding`
- [X] T003 [P] Configure ESLint with `@typescript-eslint` + `eslint-plugin-react-native` in `.eslintrc.js`; configure Prettier in `.prettierrc`; add `lint` and `format:check` scripts to `package.json`
- [X] T004 [P] Configure Jest + `@testing-library/react-native` in `jest.config.js`; add `test` and `test:ci` scripts; verify a trivial `1 + 1 = 2` test passes in `tests/unit/sanity.test.ts`
- [X] T005 [P] Configure GitHub Actions CI in `.github/workflows/ci.yml`: jobs for `typecheck` (`tsc --noEmit`), `lint` (`eslint`), and `test` (`jest --ci`); runs on push and PR
- [X] T006 [P] Configure `lint-staged` + `husky` pre-commit hook in `package.json` / `.husky/pre-commit`: runs ESLint + Prettier on staged files; runs `tsc --noEmit`
- [X] T007 [P] Configure path aliases in `tsconfig.json` (`@features/*`, `@services/*`, `@shared/*`, `@db/*`) and `babel.config.js` via `babel-plugin-module-resolver`
- [X] T008 Configure `eas.json` with `development`, `preview`, and `production` build profiles; add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to EAS environment variable list

**Checkpoint**: `npm run lint`, `npm run typecheck`, `npm test` all pass on the empty project.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: External account setup, design system, service interface definitions, mock
stubs, Supabase schema, and local SQLite schema. Nothing in Phases 3–11 can begin until
this phase is complete.

**⚠️ CRITICAL**: All [PREREQ] tasks must be completed and verified before any task in
Phases 3–11 that calls an external service.

### External Account Prerequisites

- [X] T009 [PREREQ] Create Supabase project; copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `.env` and `EXPO_PUBLIC_*` EAS secrets; copy `SUPABASE_SERVICE_ROLE_KEY` into EAS secrets (used only by Edge Functions, never exposed to client)
- [X] T010 [PREREQ] Create Anthropic account; generate API key; store as `ANTHROPIC_API_KEY` in Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets)
- [X] T011 [PREREQ] [P] Create OpenAI account; generate API key; store as `OPENAI_API_KEY` in Supabase Edge Function secrets
- [X] T012 [PREREQ] [P] Create Luma AI account; generate API key; store as `LUMA_API_KEY` in Supabase Edge Function secrets
- [X] T013 [PREREQ] [P] Create RevenueCat account; create iOS App and Android App entries; configure subscription entitlements (`premium`); obtain `REVENUECAT_API_KEY` (public) and `REVENUECAT_WEBHOOK_AUTH_HEADER` (for webhook validation); add both to EAS secrets and Supabase Edge Function secrets

### Design System

- [X] T014 Create design system spacing scale in `src/shared/tokens/spacing.ts` (4px base unit, named scale: xs=4, sm=8, md=16, lg=24, xl=32, xxl=48)
- [X] T015 [P] Create design system typography scale in `src/shared/tokens/typography.ts` (fontFamily, fontSize scale, fontWeight scale, lineHeight scale)
- [X] T016 [P] Create design system color tokens in `src/shared/tokens/colors.ts` (brand palette, semantic tokens: background, surface, text, textSecondary, accent, error, success, warning; dark/light variants)
- [X] T017 [P] Build shared primitive components in `src/shared/components/`: `LoadingState.tsx` (spinner + message), `ErrorState.tsx` (icon + message + optional retry button), `EmptyState.tsx` (icon + title + subtitle + optional CTA), `Button.tsx` (primary/secondary/ghost variants), `Card.tsx` (surface container with shadow token)
- [X] T018 Write unit tests for design token exports in `tests/unit/shared/tokens.test.ts`; verify all named values are defined and non-null; add `[P]` parallelizable test for each token file

### Service Interfaces and Mocks

- [X] T019 Define all TypeScript service interfaces in their respective files under `src/services/`: `InterpretationService.ts`, `ImageGenerationService.ts`, `VideoGenerationService.ts`, `AuthService.ts`, `LocalLockService.ts`, `StorageService.ts`, `EntitlementService.ts`, `NotificationService.ts` — use exact definitions from `contracts/service-interfaces.md`; include all error classes; add `getCacheSize(): Promise<number>` to `StorageService` interface (returns total bytes of all cached files) — needed by Settings cache display (T128)
- [X] T020 Create mock implementations for all service interfaces in `src/services/**/__mocks__/`: each mock must support configurable response modes (`success`, `degraded`, `failure`, `limit_exceeded`, `safety_blocked`, `premium_required`) via a `configure(mode)` method
- [X] T021 Create service registry type in `src/services/registry.ts` and `ServicesProvider` React context in `src/services/ServicesProvider.tsx`; wrap root `_layout.tsx` with `ServicesProvider` using concrete implementations (passed in)
- [X] T022 Create `useServices()` hook in `src/services/useServices.ts` that reads from `ServicesProvider` context; throw descriptive error if used outside provider
- [X] T023 Write unit tests in `tests/unit/services/registry.test.ts`: verify `useServices()` throws outside provider; verify all 8 services accessible when provider is present

### Database Setup

- [X] T024 Install `expo-sqlite` and `drizzle-orm`; define Drizzle ORM schema for local SQLite in `src/db/schema.ts` matching the `dreams`, `interpretations`, `media`, and `recurrence_patterns` entities from `data-model.md`; include client-only columns (`sync_status` on dreams, `local_cache_path` on media)
- [X] T025 Create SQLite client singleton in `src/db/client.ts` using `expo-sqlite` async API; run pending migrations on `openDatabaseAsync`; export typed `db` client via Drizzle
- [X] T026 [P] Write Supabase PostgreSQL migrations in `supabase/migrations/`: one migration file per table group — (1) `auth_extensions.sql`: `profiles`, `entitlements`, `consent_records`; (2) `content.sql`: `dreams`, `interpretations`, `media`; (3) `ai.sql`: `system_prompts`, `generation_jobs`; (4) `analytics.sql`: `recurrence_patterns` — use exact schemas from `data-model.md`
- [X] T027 [P] Write Supabase RLS policies in `supabase/migrations/rls.sql`: for each table, enable RLS; add `SELECT/INSERT/UPDATE/DELETE` policies restricting to `auth.uid() = user_id`; `entitlements` and `consent_records`: SELECT only for user (no client INSERT/UPDATE — service role only); `system_prompts`: no client access; `generation_jobs`: SELECT only for owner (`auth.uid() = user_id`) so the client can poll job status via `GET /rest/v1/generation_jobs?id=eq.{job_id}` — no client INSERT/UPDATE/DELETE (service role only); verify with `supabase db lint`
- [X] T028 Create `profiles` auto-creation trigger in `supabase/migrations/triggers.sql`: `AFTER INSERT ON auth.users` → inserts a row into `profiles` with defaults; also creates a corresponding `entitlements` row
- [X] T029 Seed initial active system prompt in `supabase/seed/system_prompts.sql`: insert v1.0.0 with `is_active = true`; base prompt enforces non-clinical framing + language-matching instruction; populate all three style columns (symbolic, mythological, psychological)
- [X] T030 Create `supabase/storage.sql`: define `dream-media` private bucket; add RLS storage policies (authenticated user can only read/write their own path `dream-media/{user_id}/*`)
- [X] T031 Initialize Supabase client in `src/supabase/client.ts` using `createClient(url, anonKey, { auth: { storage: ExpoSecureStoreAdapter } })`; implement `ExpoSecureStoreAdapter` in `src/supabase/secureStoreAdapter.ts` wrapping `expo-secure-store` get/set/remove
- [X] T032 Write Drizzle schema unit tests in `tests/unit/db/schema.test.ts`: verify all tables export correct column names; verify `sync_status` default value; verify `local_cache_path` nullable

**Checkpoint**: `supabase db push` succeeds; `supabase db lint` passes; Supabase client can connect and read an authenticated session; SQLite opens and applies migrations; all mock services configure without errors.

---

## Phase 3: User Story 1 — First-Time Onboarding (P1) 🎯

**Goal**: A fresh-install user completes welcome → consent → local lock setup → account
entry gate in under 3 minutes. No dream content is visible until all steps are done.

**Independent Test**: Fresh install (or cleared app state) → walk all four onboarding
screens → verify consent flag written to `profiles.ai_consent_granted` → verify
`LocalLockService.isConfigured()` returns `true` → verify user reaches sign-in screen.

- [X] T033 [US1] Implement `ExpoLocalLockService` in `src/services/auth/ExpoLocalLockService.ts`: use `expo-local-authentication` for biometric; use `expo-secure-store` for PIN storage (hashed); implement `isConfigured()`, `setupPin()`, `authenticate()`, `getLockMethod()`, `recordAuthentication()`, `isLockRequired()` per the `LocalLockService` interface
- [X] T034 [US1] Write unit tests for `ExpoLocalLockService` in `tests/unit/services/auth/ExpoLocalLockService.test.ts`: mock `expo-local-authentication`; test all method return values for enrolled/not-enrolled biometric states; test idle timeout logic; test PIN hash roundtrip
- [X] T035 [US1] Build `OnboardingWelcomeScreen` in `src/app/(auth)/onboarding/welcome.tsx`: app logo, one-sentence value prop (symbolic dream interpretation, not clinical), "Get Started" button; navigates to consent screen
- [X] T036 [US1] Build `OnboardingConsentScreen` in `src/app/(auth)/onboarding/consent.tsx`: plain-language explanation of what dream text is sent to and why; "I Agree" and "No Thanks" buttons; "No Thanks" shows a blocking modal explaining consent is required; write consent via `ConsentRecord` insert on agree
- [X] T037 [US1] Build `OnboardingLockSetupScreen` in `src/app/(auth)/onboarding/lock-setup.tsx`: checks `getLockMethod()` — shows biometric enrollment prompt if available; always shows PIN entry form (2× entry for confirmation); calls `LocalLockService.setupPin()`; no skip option
- [X] T038 [US1] Write integration test in `tests/integration/onboarding/onboarding-flow.test.ts`: render onboarding stack with mock `LocalLockService` and mock `SupabaseAuthService`; simulate tapping through all screens; assert consent screen content contains provider category; assert lock setup cannot be bypassed; assert final screen is the auth gate
- [X] T039 [US1] Implement onboarding-completed check in `src/app/_layout.tsx`: on app start check `AsyncStorage` key `onboarding_complete`; redirect to `(auth)/onboarding/welcome` if not set, `(auth)/sign-in` if set; set `onboarding_complete` after lock setup
- [X] T040 [US1] Implement app lock gate in `src/app/_layout.tsx`: subscribe to `AppState` changes; on foreground, call `LocalLockService.isLockRequired()`; if true, push `(auth)/lock` screen over all content; render nothing behind the lock screen
- [X] T041 [US1] Build `LockScreen` in `src/app/(auth)/lock.tsx`: biometric prompt triggered automatically on mount; PIN entry fallback; "Forgot PIN" link navigates to `(auth)/forgot-pin`; renders no dream content behind it
- [X] T042 [US1] Write integration test in `tests/integration/auth/lock-gate.test.ts`: simulate app backgrounding beyond idle timeout; assert lock screen renders; assert dream content is not rendered; simulate successful biometric → assert lock dismissed
- [X] T043 [US1] Build `ForgotPinScreen` in `src/app/(auth)/forgot-pin.tsx`: prompts for account password via `AuthService.getSession()` re-auth; on success allows new PIN setup via `LocalLockService.setupPin()`

**Checkpoint**: Fresh install → all onboarding screens traversable → `profiles.ai_consent_granted = true` in Supabase → `LocalLockService.isConfigured()` returns `true` → lock gate fires on re-open after 5-minute wait → all Phase 3 tests pass.

---

## Phase 4: User Story 2 — Account Creation and Auth (P1)

**Goal**: Users can create an account (email or social) and remain signed in across cold
starts. The local lock gate fires on every open without requiring backend re-auth.

**Independent Test**: Create account → close app → reopen → verify lock gate fires first
→ pass lock → verify no sign-in prompt (session resumed silently) → sign in on second
device with same account → verify both devices can access the same dream list.

- [X] T044 [US2] Implement `SupabaseAuthService` in `src/services/auth/SupabaseAuthService.ts`: implement `AuthService` interface; use `supabase.auth.signInWithPassword`, `signUp`, `signInWithOAuth` (Google + Apple), `signOut`, `getSession`, `onAuthStateChange`; store session in `expo-secure-store` via the `ExpoSecureStoreAdapter` from T031
- [X] T045 [US2] Write unit tests for `SupabaseAuthService` in `tests/unit/services/auth/SupabaseAuthService.test.ts`: mock Supabase client; test `getSession()` reads from secure store; test silent refresh path; test signOut clears secure store
- [X] T046 [US2] Build `SignInScreen` in `src/app/(auth)/sign-in.tsx`: email + password fields; "Sign In" button; "Create Account" link; "Continue with Google" button; "Continue with Apple" button; calls `AuthService.signInWithEmail()` / `signInWithGoogle()` / `signInWithApple()`; shows inline error on failure using `ErrorState`
- [X] T047 [US2] Build `SignUpScreen` in `src/app/(auth)/sign-up.tsx`: email + password + confirm-password fields; "Create Account" button; calls `AuthService.signUp()`; navigates to main app on success
- [X] T048 [US2] Integrate Apple Sign-In using `expo-apple-authentication` in `src/services/auth/SupabaseAuthService.ts`: call `AppleAuthentication.signInAsync()` → pass credential to `supabase.auth.signInWithIdToken({ provider: 'apple', token })` — requires real device for testing
- [X] T049 [US2] [P] Integrate Google Sign-In using `@react-native-google-signin/google-signin` in `src/services/auth/SupabaseAuthService.ts`: configure with Google client IDs from EAS secrets; call `GoogleSignin.signIn()` → pass id_token to `supabase.auth.signInWithIdToken({ provider: 'google', token })`
- [X] T050 [US2] Implement session persistence and silent refresh in `src/app/_layout.tsx`: on mount, call `AuthService.getSession()` — if valid, route to `(main)/journal`; if expired, Supabase SDK auto-refreshes via refresh token; if refresh fails (token gone), route to `(auth)/sign-in`
- [X] T051 [US2] Implement idle timeout tracking in `src/features/auth/useIdleTimeout.ts`: subscribe to `AppState` change events; record `lastActiveAt` on foreground; on next foreground, compare elapsed time to configured timeout; read timeout duration from `AsyncStorage` key `lock_idle_timeout_minutes` (default 5 if not set) — NOT from `profiles.notification_reminder_time`, which stores the morning notification time-of-day; call `LocalLockService.recordAuthentication()` on authenticated; set `isLockRequired()` flag
- [X] T052 [US2] Push device push token to `profiles.push_token` on auth state change in `src/features/auth/useAuthSync.ts`: call `NotificationService.registerPushToken()` after successful sign-in; re-register on token refresh
- [X] T053 [US2] Write integration test in `tests/integration/auth/session-persistence.test.ts`: mock `SupabaseAuthService.getSession()` to return a valid session; render root layout; assert app routes to `(main)/journal` without showing sign-in screen; assert `LocalLockService.isLockRequired()` still returns true (lock fires independently of session state)
- [X] T054 [US2] Write integration test in `tests/integration/auth/expired-session.test.ts`: mock `getSession()` to throw expired; mock `supabase.auth.refreshSession()` to succeed; assert silent refresh path completes without sign-in prompt; then mock refresh to fail; assert sign-in screen shown

**Checkpoint**: Email sign-up → email sign-in → Google sign-in → Apple sign-in all work on device. Cold start resumes session silently. Lock gate fires independently of session validity. All Phase 4 tests pass.

---

## Phase 5: User Story 3 — Log a Dream (P1)

**Goal**: Users can log a dream (text or voice) with an optional date, save it offline,
and have it sync automatically when connectivity returns.

**Independent Test** (entirely offline): disable connectivity → log a dream → verify it
appears in local journal with "pending sync" indicator → restore connectivity → verify
entry syncs to Supabase `dreams` table within 10 seconds.

- [X] T055 [US3] Implement dream CRUD in `src/features/dream-log/dreamRepository.ts`: `saveDream(draft)` — writes to local SQLite with `sync_status='local'`; `updateDream(id, changes)` — updates `last_modified_at` and sets `edited_since_interpretation` if description changed; `deleteDream(id)` — soft-delete locally (`is_deleted=true`) then queues hard delete
- [X] T056 [US3] Write unit tests for `dreamRepository.ts` in `tests/unit/features/dream-log/dreamRepository.test.ts`: test `saveDream` writes correct defaults; test `updateDream` bumps `last_modified_at`; test `deleteDream` sets `is_deleted=true` locally; test minimum length validation (rejects description < 20 chars when `forInterpretation=true`)
- [X] T057 [US3] Implement offline sync service in `src/features/dream-log/syncService.ts`: `syncPendingDreams()` — fetches all local SQLite rows with `sync_status !== 'synced'`; calls `POST /rest/v1/dreams` (upsert with `ON CONFLICT (id) DO UPDATE ... WHERE last_modified_at < EXCLUDED.last_modified_at`); updates local `sync_status` to `'synced'` on success; retries on failure; queue is drained in order of `logged_at`
- [X] T058 [US3] Implement connectivity listener in `src/features/dream-log/useSyncOnConnect.ts`: use `@react-native-community/netinfo`; on transition from offline → online, call `syncService.syncPendingDreams()`; on expired session during sync, attempt `AuthService.getSession()` refresh; if refresh fails, surface "Sign in to sync" notification
- [X] T059 [US3] Write unit tests for `syncService.ts` in `tests/unit/features/dream-log/syncService.test.ts`: mock Supabase REST client; test successful sync updates `sync_status`; test conflict resolution (server rejects older `last_modified_at`); test expired-session handling triggers re-auth flow; test sync retry on network failure
- [X] T060 [US3] Build `DreamLogScreen` in `src/app/(main)/log/index.tsx`: multi-line `TextInput` for dream description (min-height ~200px); date picker (defaults to today, max 1 year past, blocks future); voice dictation button; "Save" button; minimum length check blocks interpretation offer but not save; shows inline length guidance
- [X] T061 [US3] Integrate voice dictation in `DreamLogScreen` using `@react-native-voice/voice` (add to `package.json` and plan.md Primary Dependencies): tap microphone button → call `Voice.start(locale)` → accumulate `onSpeechResults` callback events → append final transcribed text to description field → call `Voice.stop()` on button release; user reviews transcription before saving; note: `expo-speech` is TTS-only and MUST NOT be used here
- [X] T062 [US3] Show offline/sync indicator in `DreamLogScreen` and journal list item: if `sync_status === 'local'` or `'sync_pending'`, show a small cloud-with-slash icon; if `sync_status === 'sync_failed'`, show error badge with manual retry option
- [X] T063 [US3] Write integration test in `tests/integration/dream-log/offline-sync.test.ts`: mock `NetInfo` to report offline; call `dreamRepository.saveDream()`; assert SQLite row exists with `sync_status='local'`; transition NetInfo to online; call `syncService.syncPendingDreams()`; assert mock Supabase called with correct payload; assert `sync_status='synced'`
- [X] T064 [US3] Write integration test for multi-device LWW conflict in `tests/integration/dream-log/conflict-resolution.test.ts`: simulate two local edits to the same dream ID with different `last_modified_at` values; assert sync upsert uses the more recent `last_modified_at`; assert older edit is discarded

**Checkpoint**: Log a dream offline → appears in SQLite → go online → appears in Supabase → log a dream online → immediate sync. Edit and delete work locally and sync. All Phase 5 tests pass.

---

## Phase 6: User Story 4 — AI Interpretation (P1) 🎯 First Vertical Slice

**Goal**: After logging a dream, a user taps "Interpret" and receives a structured
interpretation (reading, keywords, emotions, cultural references) in their input language.
All four screen states (loading/error/empty/success) are fully implemented.

**Independent Test**: Use `MockInterpretationService` configured to `success` → verify
all four interpretation components render. Switch to `degraded` → verify honest degraded
message (no fabricated content). Switch to `failure` → verify retry button. Switch to
`limit_exceeded` → verify paywall shown before any request.

- [X] T065 [US4] Implement `ClaudeInterpretationService` in `src/services/ai/interpretation/ClaudeInterpretationService.ts`: calls `POST /functions/v1/interpret` via Supabase client `functions.invoke()`; maps HTTP 200 → `InterpretationResult`; maps HTTP 403 → `ConsentRequiredError`; maps HTTP 429 → `InterpretationLimitError` with `resetDate`; maps HTTP 503 → `InterpretationProviderError(retryable: true)`; sets `isDegraded=true` when response `is_degraded=true`
- [X] T066 [US4] Write Supabase Edge Function `supabase/functions/interpret/index.ts`: authenticate request; check `profiles.ai_consent_granted`; fetch active system prompt from `system_prompts`; apply user's style layer; check + increment `entitlements.interpretations_used_this_month` atomically; call Anthropic API with `tool_use` (`format_interpretation` tool from `research.md §5`); map response to `interpretations` table row; return structured result
- [X] T067 [US4] Write unit tests for `ClaudeInterpretationService` in `tests/unit/services/ai/ClaudeInterpretationService.test.ts`: mock `supabase.functions.invoke()`; test 200 success maps to `InterpretationResult`; test `is_degraded=true` response sets `isDegraded`; test 429 throws `InterpretationLimitError` with correct `resetDate`; test 403 throws `ConsentRequiredError`; test 503 throws retryable `InterpretationProviderError`
- [X] T068 [US4] Write Edge Function integration test in `tests/integration/edge-functions/interpret.test.ts` (uses Supabase local instance): test full call with mock Anthropic SDK response; test consent check blocks call when `ai_consent_granted=false`; test entitlement check blocks at limit; test low-confidence response sets `is_degraded=true`; test prompt version recorded in `interpretations` row
- [X] T069 [US4] Implement `useInterpretation` hook in `src/features/interpretation/useInterpretation.ts`: manages loading/error/degraded/success state; calls `InterpretationService.interpret()`; checks consent first (triggers consent prompt if needed); checks entitlement first (triggers paywall if needed); handles retry
- [X] T070 [US4] Build `InterpretationScreen` in `src/app/(main)/journal/[dreamId]/interpretation.tsx`: renders `LoadingState` during request; renders `InterpretationResultView` on success; renders `ErrorState` with retry button on provider failure; renders `DegradedState` honest message on `isDegraded`; renders `EmptyState` with "Interpret" CTA before first request
- [X] T071 [US4] Build `InterpretationResultView` component in `src/features/interpretation/InterpretationResultView.tsx`: four sections — (1) overall reading paragraph; (2) keyword chips grid; (3) emotion tags row; (4) cultural references accordion list with symbol/tradition/meaning — all text in the user's dream language (passed through from API)
- [X] T072 [US4] Build `ConsentPromptModal` in `src/features/auth/ConsentPromptModal.tsx`: shown when `ConsentRequiredError` thrown; repeats the plain-language consent text; "Grant Consent" → calls consent record insert + updates `profiles.ai_consent_granted = true` → retries interpretation; "Not Now" → dismisses modal, returns to journal entry
- [X] T073 [US4] Write unit tests for `useInterpretation` hook in `tests/unit/features/interpretation/useInterpretation.test.ts`: use `renderHook`; test loading state transitions; test success state sets interpretation result; test `ConsentRequiredError` triggers consent modal flag; test `InterpretationLimitError` triggers paywall flag; test retry resets to loading
- [X] T074 [US4] Write integration test in `tests/integration/interpretation/interpretation-flow.test.ts`: render `InterpretationScreen` with mock `InterpretationService(success)` → assert all four result sections render; with `degraded` → assert honest message, no fabricated text; with `failure` → assert retry button; with `limit_exceeded` → assert paywall component renders before any service call is made

**Checkpoint (first full vertical slice)**: Log a dream → tap Interpret → see loading → see all four interpretation components in the user's language. Degraded and failure states render correctly. Limit paywall fires before any API call. All Phase 6 tests pass.

---

## Phase 7: User Story 5 — Dream Illustration (Image + Video) (P1)

**Goal**: After interpretation, the dream is automatically illustrated with an AI image.
Premium users can generate a short video. Regeneration is enforced. Media is cached.

**Independent Test — Image**: Open entry with completed interpretation → assert image
generation begins automatically → assert loading state shows → assert image renders and is
cached locally → tap "Regenerate" 3 times → assert 4th attempt shows limit message.

**Independent Test — Video**: Sign in as premium user → open entry → tap "Generate Video"
→ assert `202 Accepted` received → assert "generating" state shown → simulate job
completion webhook → assert video renders + push notification received.

### Image Generation

- [X] T075 [US5] Implement `ExpoStorageService` in `src/services/storage/ExpoStorageService.ts`: `cacheMedia(mediaId, signedUrl)` — download to `FileSystem.cacheDirectory/morpheo/media/{mediaId}.{ext}`; `isCached(mediaId)` — check file exists; `getLocalUri(mediaId)` — return cached path or null; `evictToLimit(limitBytes)` — LRU eviction via file `modificationTime`; `clearCache()` — delete all cached files; `getCacheSize()` — sum `FileSystem.getInfoAsync(path, { size: true }).size` for all files under `morpheo/media/`; return total bytes
- [X] T076 [US5] Write unit tests for `ExpoStorageService` in `tests/unit/services/storage/ExpoStorageService.test.ts`: mock `expo-file-system`; test cache write → `isCached` returns true; test LRU eviction order; test `clearCache` removes all files
- [X] T077 [US5] Implement `OpenAIImageGenerationService` in `src/services/ai/image/OpenAIImageGenerationService.ts`: calls `POST /functions/v1/generate-image`; maps 200 → `MediaResult`; maps 400 `safety_blocked` → `ContentSafetyError`; maps 409 `regen_limit_reached` → `RegenerationLimitError`; maps 429 → `ImageLimitError`; after success, calls `StorageService.cacheMedia()` to cache locally
- [X] T078 [US5] Write Supabase Edge Function `supabase/functions/generate-image/index.ts`: authenticate; check `entitlements.images_used < monthly_image_limit`; run input content-safety heuristic on dream description; call OpenAI gpt-image-2 API (`POST /v1/images/generations`); catch 400 moderation_blocked → set `safety_input_passed=false`; upload response image to Supabase Storage `dream-media/{user_id}/{dream_id}/image.jpg`; update `media` row; return signed URL (1h expiry)
- [X] T079 [US5] Write unit tests for `OpenAIImageGenerationService` in `tests/unit/services/ai/OpenAIImageGenerationService.test.ts`: mock Edge Function invocation; test successful generation returns `MediaResult` with `generation_status='complete'`; test content safety block throws `ContentSafetyError('input')`; test regen limit throws `RegenerationLimitError(3)` for free user
- [X] T080 [US5] Write Edge Function integration test in `tests/integration/edge-functions/generate-image.test.ts`: test full flow with mock OpenAI SDK; test input safety check fires before OpenAI call; test entitlement check increments `images_used`; test storage upload writes to correct path
- [X] T081 [US5] Implement `useImageGeneration` hook in `src/features/media-generation/useImageGeneration.ts`: auto-triggers image generation after interpretation completes (if no image exists yet); manages loading/error/safety-blocked/success states; handles regeneration (checks `regenerationCount < maxRegenerations`); on success, stores `localCachePath` in local SQLite `media` row
- [X] T082 [US5] Build `DreamMediaView` component in `src/features/media-generation/DreamMediaView.tsx`: shows `LoadingState` while `generation_status='pending'|'processing'`; shows cached image via `expo-image` with fade-in when complete; shows `ErrorState` with retry on `'failed'`; shows `ContentSafetyMessage` on `'safety_blocked'`; shows "Regenerate" button with count indicator (e.g. "Regenerate (2/3 used)")
- [X] T083 [US5] Write integration test in `tests/integration/media/image-generation.test.ts`: render `DreamMediaView` with mock `ImageGenerationService(success)` → assert image renders; with `safety_blocked` → assert non-judgmental message (no image slot error); with `failure` → assert retry button; regeneration count increments correctly; 4th regeneration attempt blocked with correct message

### Video Generation (Premium, Async)

- [X] T084 [US5] Implement `LumaVideoGenerationService` in `src/services/ai/video/LumaVideoGenerationService.ts`: calls `POST /functions/v1/generate-video`; maps 202 → `VideoJob`; maps 403 → `PremiumRequiredError`; maps 400 `safety_blocked` → `ContentSafetyError`; maps 409 → `RegenerationLimitError`; implements `getJobStatus(jobId)` via `GET /rest/v1/generation_jobs`
- [X] T085 [US5] Write Supabase Edge Function `supabase/functions/generate-video/index.ts`: authenticate; verify `entitlements.subscription_tier = 'premium'`; run input safety check; call Luma Dream Machine API (`POST /v1/generations`) with `{ "do_not_train": true }` or equivalent opt-out field per Luma API docs (constitution III MUST: training opt-out by default); store `generation_id` in `generation_jobs.external_job_id`; return 202 with `job_id`; implement Luma polling or webhook handler that on completion: downloads video → uploads to Supabase Storage → updates `media` row → triggers push notification; add test assertion in T086 that the outbound Luma request body includes the opt-out flag
- [X] T086 [US5] Write unit tests for `LumaVideoGenerationService` in `tests/unit/services/ai/LumaVideoGenerationService.test.ts`: test 202 maps to `VideoJob`; test 403 throws `PremiumRequiredError`; test `getJobStatus` returns correct status transitions; **test that the outbound Luma API request body includes the training opt-out flag** (mock the HTTP client and assert the request payload contains `do_not_train: true` or equivalent per Luma API — satisfies constitution III FR-028)
- [X] T087 [US5] Add Realtime subscription for video job status in `useVideoGeneration` hook in `src/features/media-generation/useVideoGeneration.ts`: subscribe to `generation_jobs:id=eq.{jobId}` Realtime channel on job submission; update local state on `UPDATE` event; unsubscribe on unmount or job completion
- [X] T088 [US5] Build `VideoGenerationButton` component in `src/features/media-generation/VideoGenerationButton.tsx`: shown only when entry has interpretation; if free user → shows "Generate Video (Premium)" button → tapping opens paywall; if premium user → shows "Generate Video" → tapping calls `VideoGenerationService.submitVideoJob()`; while job running → shows "Generating… we'll notify you" state with spinner; on completion → shows video player via `expo-video`
- [X] T089 [US5] Implement `ExpoNotificationService` in `src/services/notifications/ExpoNotificationService.ts`: `requestPermission()` via `Notifications.requestPermissionsAsync()`; `scheduleReminder(h, m)` via `Notifications.scheduleNotificationAsync()` with daily repeat trigger; `cancelReminder()` cancels all scheduled; `registerPushToken()` via `Notifications.getExpoPushTokenAsync()` → updates `profiles.push_token` via Supabase
- [X] T090 [US5] Write unit tests for `ExpoNotificationService` in `tests/unit/services/notifications/ExpoNotificationService.test.ts`: mock `expo-notifications`; test `requestPermission` returns granted/denied correctly; test `scheduleReminder` creates daily trigger; test `registerPushToken` calls Supabase update
- [X] T091 [US5] Write integration test in `tests/integration/media/video-generation.test.ts`: render `VideoGenerationButton` with premium entitlement; assert `LumaVideoGenerationService.submitVideoJob()` called; simulate Realtime UPDATE with `status='complete'`; assert video player shown; render with free entitlement; assert paywall shown instead of submit

**Checkpoint**: Image auto-generates after interpretation → loads → caches locally → reopening entry uses cache (no network). Regeneration limit enforced (free=3, premium=5) server-side. Premium video submits async job → Realtime status update → push notification → video plays. All Phase 7 tests pass.

---

## Phase 8: User Story 6 — Dream Journal & History (P2)

**Goal**: Users browse a smooth, virtualized journal list (date, snippet, thumbnail),
open entries for full detail, and search/filter by keyword, emotion, or date range.

**Independent Test**: Seed 200+ entries in local SQLite → render journal list → scroll
continuously → assert no perceptible frame drops → assert thumbnails lazy-load →
search "water" → assert filtered results → open one entry → assert full detail renders.

- [X] T092 [US6] Build `JournalListScreen` in `src/app/(main)/journal/index.tsx` using `@shopify/flash-list`: fetch paginated dreams from SQLite (order by `dream_date DESC`, page size 20); render `JournalEntryCard` per item; show `EmptyState` when no entries; show `LoadingState` on initial load
- [X] T093 [US6] Build `JournalEntryCard` component in `src/features/journal/JournalEntryCard.tsx`: shows dream date, first 80 chars of description as snippet, image thumbnail via `expo-image` (lazy, fade-in); pressing navigates to `[dreamId]/detail`; `sync_status` indicator (cloud icon) if pending
- [X] T094 [US6] Build `DreamDetailScreen` in `src/app/(main)/journal/[dreamId]/detail.tsx`: shows full dream text, dream date, interpretation result (via `InterpretationResultView`), `DreamMediaView` (image + video button), "Edit" button, "Delete" button, recurrence callout (placeholder for Phase 9)
- [X] T095 [US6] Implement search in `src/features/journal/useJournalSearch.ts`: debounced (300ms) SQLite `LIKE` query across `dreams.description` and related `interpretations.keywords` (joined); returns filtered dream IDs; search bar in `JournalListScreen` header
- [X] T096 [US6] Implement filters in `src/features/journal/useJournalFilters.ts`: filter by emotion using SQLite-compatible JSON search — emotions stored as a JSON array column, query via Drizzle `sql\`json_each(interpretations.emotions)\`` subquery or `LIKE '%"emotion"%'` pattern (do NOT use PostgreSQL `@> ARRAY[]` syntax — this is SQLite); filter by date range (`dreams.dream_date BETWEEN start AND end`); filter panel slide-up modal in `JournalListScreen`
- [X] T097 [US6] Show explicit empty state for search/filter no-results in `JournalListScreen`: distinct message ("No dreams match this search") vs. no-dreams-yet ("Log your first dream"); clear filters button
- [X] T098 [US6] Write performance test in `tests/unit/features/journal/JournalList.perf.test.ts`: render `JournalListScreen` with 500 mock entries; assert render completes within budget; assert `FlashList` `renderItem` is not called for off-screen items on initial render
- [X] T099 [US6] Write unit tests for `useJournalSearch` and `useJournalFilters` in `tests/unit/features/journal/`: test search returns entries matching keyword in description; test search matches on interpretation keywords; test emotion filter returns only matching entries; test date range filter; test combined emotion + date range filter

**Checkpoint**: Journal list renders 200+ entries smoothly. Search, filter, and empty states all work. Full entry detail opens with interpretation and media. All Phase 8 tests pass.

---

## Phase 9: User Story 7 — Recurrence Detection (P2)

**Goal**: The app surfaces recurring symbols and emotions within and across journal entries.
Free users see top-3 per type over 30 days. Premium users see full analytics.

**Independent Test**: Seed 5+ entries all containing keyword "water" → open one entry →
assert recurrence callout shows count. Open Insights screen as free user → assert top-3
data shown. Open as premium → assert full analytics with time range selector.

- [X] T100 [US7] Write PostgreSQL recurrence trigger function in `supabase/migrations/recurrence_trigger.sql`: `compute_recurrence(user_id, keywords[], emotions[], dream_id)` — for each keyword/emotion, UPSERT into `recurrence_patterns` with updated `occurrence_count`, `dream_ids`, `last_seen_at`; attach `AFTER INSERT ON interpretations` trigger
- [X] T101 [US7] Write integration test for recurrence trigger in `tests/integration/db/recurrence_trigger.test.ts` (uses Supabase local): insert 4 interpretations all with keyword `"water"` for same user; assert `recurrence_patterns` row for `"water"` has `occurrence_count=4`; assert `dream_ids` array has all 4 dream IDs
- [X] T102 [US7] Implement `RecurrenceRepository` in `src/features/recurrence/recurrenceRepository.ts`: `getTopRecurrences(userId, type, limit, days)` — queries local SQLite `recurrence_patterns` table (synced from Supabase); `getRecurrencesForDream(dreamId)` — returns terms that appear in > 1 dream and include this dream in `dream_ids`
- [X] T103 [US7] Add recurrence callout to `DreamDetailScreen` from Phase 8 (T094): use `RecurrenceRepository.getRecurrencesForDream(dreamId)` → for each term with `occurrence_count > 1`, render a callout chip (e.g. "💧 water · 4 this month") above interpretation section; show nothing if no recurrences
- [X] T104 [US7] Build `InsightsScreen` in `src/app/(main)/insights/index.tsx`: fetch entitlement tier; free users: render `TopRecurrencesView` (top 3 keywords + top 3 emotions, last 30 days, locked charts placeholder + upgrade prompt); premium users: render full `RecurrenceAnalyticsView`
- [X] T105 [US7] Build `TopRecurrencesView` in `src/features/recurrence/TopRecurrencesView.tsx`: horizontal scroll of top-3 keyword chips + emotion tags; small occurrence count badge; tapping a chip filters the journal list to that term (via navigation param)
- [X] T106 [US7] Build `RecurrenceAnalyticsView` in `src/features/recurrence/RecurrenceAnalyticsView.tsx` (premium): time range selector (30d / 90d / all time) — calls `recurrenceRepository` with `days` param; bar or sparkline chart using `react-native-gifted-charts` or `victory-native`; list of all recurrences with links to affected entries
- [X] T107 [US7] Write unit tests in `tests/unit/features/recurrence/`: test `getTopRecurrences` returns top-N ordered by `occurrence_count`; test `getRecurrencesForDream` filters to terms involving the specific dream; test free-tier 30-day window filtering; test premium all-time query
- [X] T108 [US7] Sync `recurrence_patterns` from Supabase to local SQLite in `syncService.ts` (extend T057): after sync of dreams, fetch updated `recurrence_patterns` for the user and upsert into local SQLite

**Checkpoint**: Log 4 dreams with the same symbol → open the 4th → see recurrence callout. Open Insights → see top-3 for free user. Upgrade to premium → see full chart with time range selector. All Phase 9 tests pass.

---

## Phase 10: User Story 8 — Monetization and Subscription Management (P2)

**Goal**: Free-tier limits are clearly communicated before they are hit. Premium features
are gated server-side. RevenueCat manages purchases. The paywall screen appears before any
gated action and never mid-flow as a surprise.

**Independent Test**: Mock server entitlement as free + limit exhausted → attempt
interpretation → assert paywall shown before any API call → mock successful purchase →
assert entitlement re-fetched from server → assert premium features unlocked. Manually
tamper client-side entitlement store → attempt video generation → assert 403 from Edge
Function (server gate holds).

- [X] T109 [US8] [PREREQ] Configure RevenueCat products and entitlements: create "Premium Monthly" and "Premium Annual" products in App Store Connect and Google Play Console; link to RevenueCat `premium` entitlement; configure RevenueCat webhook to point at `POST /functions/v1/webhooks/revenuecat`
- [X] T110 [US8] Implement `RevenueCatEntitlementService` in `src/services/subscription/RevenueCatEntitlementService.ts`: initialize `Purchases.configure({ apiKey })` on app start; `fetchEntitlement()` — calls `GET /rest/v1/entitlements` (server-authoritative, not RevenueCat SDK); `canInterpret()` / `canGenerateImage()` / `isPremium()` — each calls `fetchEntitlement()` (no local cache for gate decisions); `purchasePremium()` — calls `Purchases.purchasePackage()`; `manageSubscription()` — calls `Purchases.showManageSubscriptions()`
- [X] T111 [US8] Write unit tests for `RevenueCatEntitlementService` in `tests/unit/services/subscription/RevenueCatEntitlementService.test.ts`: mock RevenueCat SDK and Supabase; test `canInterpret()` returns false when `interpretations_used >= monthly_interpretation_limit`; test `isPremium()` returns server tier (not client SDK value); test `purchasePremium()` success triggers entitlement re-fetch; test tampered client SDK state does not affect `isPremium()`
- [X] T112 [US8] Write Supabase Edge Function `supabase/functions/webhooks/revenuecat/index.ts`: validate HMAC signature header (`REVENUECAT_WEBHOOK_AUTH_HEADER`); handle `INITIAL_PURCHASE` / `RENEWAL` → set `subscription_tier='premium'` in `entitlements` and `profiles`; handle `CANCELLATION` → no immediate change (premium until expiry); handle `EXPIRATION` → set `subscription_tier='free'`; always return 200
- [X] T113 [US8] Build `PaywallScreen` in `src/app/(main)/paywall.tsx`: shown as a modal (not a navigation screen) from any premium gate; clearly lists free limits (5 interps, 3 images, no video) vs. premium (unlimited + video + full insights); "Start Premium" button → calls `EntitlementService.purchasePremium()`; "Maybe Later" → dismisses; shown BEFORE any AI request is made
- [X] T114 [US8] Integrate paywall gate into `useInterpretation` (T069), `useImageGeneration` (T081), `useVideoGeneration` (T087), and recurrence analytics (T106): before each action, call the relevant `canX()` method; if false, navigate to `PaywallScreen` modal; block the underlying service call until paywall resolves
- [X] T115 [US8] Show usage indicators in the UI: in `JournalListScreen` header or dream detail screen, show "X of 5 interpretations used this month · resets [Month] 1st" for free users; show nothing for premium users; fetch from `entitlements` after each use
- [X] T116 [US8] Write integration test in `tests/integration/subscription/entitlement-gate.test.ts`: mock server `entitlements` to return limit-exhausted free tier; attempt interpretation; assert paywall renders before `ClaudeInterpretationService.interpret()` is called (spy on the service); mock successful purchase; assert `entitlements` re-fetched; assert interpretation proceeds

**Checkpoint**: Free user limit gates work (paywall before action, not mid-action). RevenueCat purchase updates server entitlement via webhook. Tampered client state does not bypass server gate. All Phase 10 tests pass.

---

## Phase 11: User Story 9 — Settings and Personalization (P3)

**Goal**: Users can customize interpretation style, configure notifications, manage consent,
export all data, and permanently delete their account. All actions are available from
Settings at all times.

**Independent Test**: Change style to "Mythological" → request next interpretation →
assert style layer applied (Edge Function uses `style_mythological` column). Enable
reminder → assert OS notification scheduled. Trigger export → receive download link.
Trigger account deletion → verify all data removed from Supabase within 30 days.

- [X] T117 [US9] Build `SettingsScreen` in `src/app/(main)/settings/index.tsx`: settings list with sections — Account (profile info, manage subscription); Personalization (interpretation style, notifications); Privacy (consent management, data export, account deletion); App (about, cache info, clear cache)
- [X] T118 [US9] Build interpretation style selector in `src/app/(main)/settings/style.tsx`: three toggle buttons: Symbolic/Archetypal, Mythological/Cultural, Psychological/Jungian; on select → `PATCH /rest/v1/profiles` to update `interpretation_style`; update local Zustand store; Edge Function reads this preference at call time
- [X] T119 [US9] Update `interpret` Edge Function (T066) to apply user's style: fetch `profiles.interpretation_style` from DB; append `system_prompts.style_{preference}` to the system message after the base prompt — this is the ONLY user-controllable layer; verify it does not override the base non-clinical framing
- [X] T120 [US9] Write unit test in `tests/unit/features/settings/stylePreference.test.ts`: test that `style_psychological` prompt layer is appended AFTER the base prompt (not replacing it); test that three valid styles produce three distinct prompt constructions; test that no custom free-text is accepted
- [X] T121 [US9] Build notification settings screen in `src/app/(main)/settings/notifications.tsx`: toggle switch + time picker; on enable → `NotificationService.requestPermission()` then `scheduleReminder(h, m)`; on disable → `cancelReminder()`; on time change → reschedule; persist preference in `profiles.notification_reminders_enabled` and `notification_reminder_time`
- [X] T122 [US9] Write unit test in `tests/unit/features/settings/notifications.test.ts`: mock `ExpoNotificationService`; test enabling schedules daily trigger with correct time; test disabling cancels all; test permission denial shows guidance (not a crash)
- [X] T123 [US9] Build privacy settings screen in `src/app/(main)/settings/privacy.tsx`: shows current consent status (granted/withdrawn with date); "Withdraw Consent" button → PATCH `profiles.ai_consent_granted=false` + insert `consent_records` row; "Grant Consent" button if currently withdrawn; both update `profiles` immediately
- [X] T124 [US9] Implement data export in `src/app/(main)/settings/export.tsx`: "Export My Data" button → calls `POST /functions/v1/export-data`; shows "Export queued — we'll email you when it's ready" confirmation; write export Edge Function `supabase/functions/export-data/index.ts`: assembles JSON of all dreams + interpretations; writes to `dream-media/{user_id}/exports/{timestamp}.json` in Supabase Storage; sends email via Supabase `auth.sendEmail` or SendGrid; returns download link in-app
- [X] T125 [US9] Implement account deletion flow in `src/app/(main)/settings/delete-account.tsx`: "Delete Account" button → shows two-step modal: step 1 warns about data loss + subscription cancellation; step 2 requires the user to type the exact phrase **`DELETE MY ACCOUNT`** into a text field (matches the confirmation string expected by the Edge Function per `contracts/api-endpoints.md`); "Confirm" button disabled until text matches exactly; on confirm → calls `DELETE /functions/v1/account` with `{ "confirmation": "DELETE MY ACCOUNT" }`; signs user out immediately; clears local SQLite; shows "Your data will be fully removed within 30 days" screen
- [X] T126 [US9] Write account deletion Edge Function `supabase/functions/account-delete/index.ts`: validate `confirmation === 'DELETE MY ACCOUNT'`; sign out all sessions via `supabase.auth.admin.signOut(userId, 'global')`; set `deletion_scheduled_at = now()` on `profiles`; send confirmation email; schedule hard-delete job (pg_cron) for 30 days out that CASCADE-deletes all user data including Storage files
- [X] T127 [US9] Write integration tests in `tests/integration/settings/`: test consent withdrawal blocks AI calls; test export Edge Function creates correct JSON structure (dreams + interpretations array); test account deletion signs out all sessions; test deletion of subscribed user displays subscription cancellation warning
- [X] T128 [US9] Implement cache management in `src/app/(main)/settings/index.tsx`: show total local cache size via `StorageService.getCacheSize()` (added in T019 + T075 — do NOT use `evictToLimit(0)` which would destructively evict all files); format as "X MB used"; "Clear Cache" button → calls `StorageService.clearCache()` + shows confirmation snackbar; refresh size display after clear

**Checkpoint**: All three style presets produce different Edge Function calls. Reminder notification fires at scheduled time. Consent withdrawal blocks next interpretation. Export email received with correct data. Account deletion signs user out immediately. All Phase 11 tests pass.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Performance validation, accessibility, E2E test suite, build pipeline.

- [X] T129 [P] Configure Detox (or Maestro) E2E test framework in `tests/e2e/`; write E2E test covering the core P1 vertical slice: fresh install → onboarding → sign up → log dream offline → go online → sync → interpret → view image → verify all states on a physical device simulator
- [X] T130 [P] Run cold start profiling with Expo's `--profile` flag on a mid-range Android emulator; measure `JS bundle parse time` + `TTI`; if > 2s, apply lazy screen loading (`React.lazy` / `import()`) in `src/app/_layout.tsx` for heavy screens
- [X] T131 [P] Audit all AI-dependent screens (InterpretationScreen, DreamMediaView, VideoGenerationButton, InsightsScreen) against WCAG 2.1 AA: verify color contrast ≥ 4.5:1 for text; verify all interactive elements have `accessibilityLabel`; verify loading states announce via `accessibilityLiveRegion='polite'`; verify error states announce via `accessibilityLiveRegion='assertive'`
- [X] T132 [P] Implement cache size limit eviction in `ExpoStorageService` (T075): call `evictToLimit(200 * 1024 * 1024)` (200MB) on app foreground; write unit test asserting oldest files removed first
- [X] T133 Verify all 7 constitution principles against the final codebase: (I) run `eslint --max-warnings 0`; (II) run `jest --ci --coverage` → assert coverage ≥ 80% on changed files; (III) manually verify consent check in Edge Function logs; (IV) verify `system_prompts.is_active` single-row constraint; (V) visually verify all 4 states on each AI screen; (VI) run cold start measurement; (VII) verify server-side entitlement gate via manual API call with tampered JWT
- [X] T134 Run all quickstart.md validation scenarios (§1–§10) on a physical iOS device and an Android emulator; record pass/fail per scenario; fix any failures
- [X] T135 [P] Configure Supabase pg_cron extension: schedule monthly entitlement reset job (`0 0 1 * *` UTC); schedule account deletion cleanup job (`0 3 * * *` UTC — processes accounts past 30-day mark)
- [X] T136 [P] Write `CLAUDE.md` at the repository root documenting: feature-based folder convention, how to add a new service adapter (interface → implementation → mock → registry), how to add a new Edge Function, how to run the local Supabase stack, and the constitution's core non-negotiable rules for future contributors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — blocks all user story phases
  - [PREREQ] tasks (T009–T013): Must be verified before any phase touching external services
- **Phases 3–7 (P1 User Stories)**: All depend on Phase 2 completion; must be implemented **sequentially in P1 priority order** — P1 fully tested before P2 begins
- **Phases 8–10 (P2 User Stories)**: Start after all Phase 3–7 checkpoints pass
- **Phase 11 (P3 User Story)**: Starts after all Phase 8–10 checkpoints pass
- **Final Phase**: Starts after Phase 11

### User Story Dependencies

| Story | Depends On |
|---|---|
| US1 Onboarding | Phase 2 complete |
| US2 Auth | US1 complete (lock gate must exist before auth sessions are created) |
| US3 Log a Dream | US2 complete (needs authenticated user ID for dreams table) |
| US4 AI Interpretation | US3 complete (needs a saved dream to interpret); T009+T010 (Supabase + Anthropic keys) |
| US5 Image/Video | US4 complete (image auto-triggers after interpretation); T011+T012 (OpenAI + Luma keys) |
| US6 Journal | US3 complete (needs dreams to display); US4+US5 recommended for full detail |
| US7 Recurrence | US4 complete (recurrence computed from interpretations) |
| US8 Monetization | US4+US5 complete (gates wrap interpretation + image + video); T013 (RevenueCat) + T109 |
| US9 Settings | US2 complete (auth required); US4 complete (style affects interpretation) |

---

## Parallel Opportunities

```
# Phase 1 — run all in parallel after T001:
T003, T004, T005, T006, T007, T008

# Phase 2 — PREREQ tasks in parallel:
T009 (Supabase) → blocks T019, T022, T023, T026, T027
T010 (Anthropic) → blocks T066, T068 → start in parallel with T011, T012, T013
T011 (OpenAI) → blocks T078, T080
T012 (Luma) → blocks T085, T086
T013 (RevenueCat) → blocks T110, T109

# Phase 2 — infrastructure in parallel after T009:
T014, T015, T016 (tokens + interfaces) → fully parallel
T020, T024 (SQLite schema + seed) → parallel with T026, T027 (Supabase migrations)

# Phase 7 — image and video tracks:
T075–T083 (image generation) in parallel with T089–T090 (notification service)

# Final Phase — all polish tasks in parallel:
T129, T130, T131, T132, T135, T136
```

---

## Implementation Strategy

### MVP: First Demoable Vertical Slice (Phases 1–6)

1. Complete Phase 1: Setup (~1 day)
2. Complete Phase 2: Foundational (~2-3 days) — PREREQ accounts first
3. Complete Phase 3: Onboarding
4. Complete Phase 4: Auth
5. Complete Phase 5: Dream Logging (offline first)
6. Complete Phase 6: AI Interpretation
7. **STOP AND DEMO**: User can log a dream and receive a full structured interpretation in their language

**What the MVP proves**: Every P1 non-negotiable (adapter pattern, consent gate, server-side prompt, degraded state, offline sync, entitlement check) is working before image generation is added.

### Increment 2: Full P1 (Phase 7)

Add image generation, media caching, video generation (async + push notification). All P1 user stories complete. App is feature-complete for its core loop.

### Increment 3: P2 Features (Phases 8–10)

Journal browse + search/filter, recurrence insights, subscription management. App is now a shippable product.

### Increment 4: P3 + Polish (Phases 11 + Final)

Settings/personalization, data export/deletion, accessibility audit, E2E tests, App Store builds.
