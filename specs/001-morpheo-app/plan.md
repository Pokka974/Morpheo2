# Implementation Plan: Morpheo — AI Dream Interpretation App

**Branch**: `001-morpheo-app` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-morpheo-app/spec.md`

---

## Summary

Morpheo is a solo-built, portfolio-grade cross-platform mobile app (iOS + Android) that
lets users log dreams and receive structured AI interpretations — including symbolic
keywords, emotions, and cultural/mythological references — alongside an AI-generated
illustrative image, with an optional premium video. All dreams and interpretations are
stored in a personal journal; recurring symbols and emotions are surfaced across entries
over time. A free tier (5 interpretations + 3 images/month) and a premium subscription
(unlimited + video) are enforced server-side via Supabase RLS and RevenueCat.

**Technical approach**: Expo managed workflow React Native client → Supabase backend
(PostgreSQL + Auth + Storage + Edge Functions) → Claude claude-sonnet-4-6 for structured
interpretation → DALL-E 3 for synchronous image generation → Luma Dream Machine for async
premium video generation. All AI providers wrapped behind TypeScript service interfaces
(constitution adapter mandate). See `research.md` for full decision rationale.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), React Native via Expo SDK 53+

**Primary Dependencies**:
- `expo`, `expo-router` (navigation)
- `zustand` (state management)
- `expo-sqlite` + `drizzle-orm` (local persistence)
- `@supabase/supabase-js` (backend client)
- `expo-local-authentication` (biometric/PIN)
- `expo-secure-store` (encrypted token storage)
- `expo-notifications` (push + local notifications)
- `expo-file-system` (media cache)
- `react-native-purchases` (RevenueCat IAP)
- `expo-apple-authentication`, `@react-native-google-signin/google-signin` (social auth)

**Storage**:
- **Client**: SQLite via `expo-sqlite` (synced tables: dreams, interpretations, media, recurrence_patterns)
- **Server**: Supabase PostgreSQL (authoritative)
- **Media**: Supabase Storage (private buckets, CDN-backed signed URLs)
- **Secrets/tokens**: `expo-secure-store` (iOS Keychain / Android Keystore)

**Testing**:
- `jest` + `@testing-library/react-native` for unit and component tests
- `jest` with mock service implementations for AI adapter tests
- Detox or Maestro for E2E flows (auth, offline sync, journal)

**Target Platform**: iOS 16+ and Android 10+ (Expo managed workflow; physical device required for biometric)

**Project Type**: Mobile app (cross-platform React Native)

**Performance Goals**:
- Cold start < 2s on mid-range device (SC-002)
- 60fps scroll in journal list with 500+ entries (SC-003)
- Dream save (local) < 2s (SC-004)
- Interpretation result displayed < 30s (SC-005)

**Constraints**:
- Offline-capable dream logging with automatic sync (FR-006)
- Solo-maintainable: managed infrastructure only; no self-hosted services
- All AI providers behind adapter interfaces — no direct provider calls from feature code
- Free-tier limits enforced server-side (RLS + Edge Function entitlement checks)
- System prompt server-side and versioned (never hardcoded in client)
- Expo managed workflow (no bare workflow)

**Scale/Scope**: Solo developer; initial scale 0-10k MAU; infrastructure auto-scales with Supabase

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked below after Phase 1 design.*

### I. Code Quality ✅

| Requirement | Plan satisfies it |
|---|---|
| TypeScript strict mode everywhere | `tsconfig.json` `"strict": true`; enforced in CI |
| No `any` without inline justification | ESLint rule `@typescript-eslint/no-explicit-any: error` |
| ESLint + Prettier enforced in CI | Pre-commit hook (`lint-staged`) + CI step |
| Feature-based folder structure | `src/features/{feature}/` per feature; no global `components/` or `utils/` for domain logic |
| Business logic NOT in UI components | Zustand stores + hooks in feature folder; components receive props only |
| External integrations behind adapters | `InterpretationService`, `ImageGenerationService`, `VideoGenerationService`, `AuthService`, `EntitlementService` interfaces (see `contracts/service-interfaces.md`). Zero direct provider SDK calls from feature code. |

**Status**: PASS

### II. Testing Standards ✅

| Requirement | Plan satisfies it |
|---|---|
| Unit tests for all business logic | `interpretation-parser.test.ts`, `recurrence-detection.test.ts`, `entitlement-check.test.ts` in each feature's `__tests__/` |
| Integration tests for auth flows + dream pipeline | Detox/Maestro E2E: full onboarding → log → interpret → journal pipeline |
| AI-dependent code tested against mocked responses | All three AI service interfaces have mock implementations; CI never calls live provider APIs |
| No feature "done" without tests | Enforced in PR template: test file must be included or PR rejected |

**Status**: PASS

### III. Privacy and Data Handling ✅ (with one documented pragmatic tradeoff)

| Requirement | Plan satisfies it |
|---|---|
| Biometric/PIN lock gate, re-engages on idle | `LocalLockService` via `expo-local-authentication` + `expo-secure-store` for PIN; idle timeout tracked in app foreground/background events |
| Dream text encrypted at rest | **See Complexity Tracking** — OS-level FDE (iOS Data Protection / Android FBE) + app lock gate. Not application-layer SQLite encryption. |
| Generated media encrypted at rest | Supabase Storage AES-256 at rest; local cache on device encrypted by OS FDE |
| Explicit consent before AI call | `profiles.ai_consent_granted` checked server-side in every AI Edge Function (FR-002, FR-025) |
| Full export from Settings | `POST /functions/v1/export-data`; available at all times |
| Irreversible account deletion | `DELETE /functions/v1/account`; permanent within 30 days; no soft-delete flag |
| AI provider model-training opt-out by default | Anthropic: no training on API content by default ✓. OpenAI DALL-E: no training on API content per OpenAI data policy ✓. Luma: opt-out configured in API request parameters ✓ |

**Status**: PASS (one pragmatic tradeoff documented in Complexity Tracking)

### IV. AI Behavior and Safety ✅

| Requirement | Plan satisfies it |
|---|---|
| System prompt versioned + server-side | `system_prompts` table in Supabase; Edge Function fetches active row at call time; client never sees prompt |
| Non-clinical framing in base prompt (cannot be overridden) | Base prompt in `system_prompts.base_prompt` enforces non-clinical framing; user style layers are in separate columns (`style_symbolic`, etc.) appended after the base — they cannot override it |
| Graceful degradation on low-quality output | `confidence` field in Claude tool schema; Edge Function sets `is_degraded = true` when confidence = low or tool_use fails; client renders honest degraded state |
| Content-safety filtering on image/video input + output | DALL-E 3: built-in input + output safety ✓. Luma: input safety check before submission + output review before Storage write. Additional input pre-check heuristic in Edge Function for both. |

**Status**: PASS

### V. UX Consistency ✅

| Requirement | Plan satisfies it |
|---|---|
| Single design system | `src/shared/tokens/` (spacing, typography, color tokens); `src/shared/components/` (design-system primitives only — no domain logic); all feature screens import from here |
| All AI-dependent screens have loading/error/empty/success states | Enforced as part of task definition for every AI-dependent screen; spec FR-009 is an acceptance criterion on every screen task |
| Offline behavior explicit | Dream logging works offline (SQLite); interpretation/generation require connectivity and show explicit "requires internet" state; offline queue indicator in journal list |

**Status**: PASS

### VI. Performance ✅

| Requirement | Plan satisfies it |
|---|---|
| Cold start < 2s | Expo managed workflow with lazy-loaded feature screens; no heavy synchronous initialization on startup |
| 60fps scroll with hundreds of entries | `FlashList` (from `@shopify/flash-list`) for virtualized journal list; thumbnails lazy-loaded with `expo-image`; never loads full journal into memory |
| Media lazy-loaded + cached locally | `StorageService.cacheMedia()` downloads and caches to `expo-file-system`; `StorageService.getLocalUri()` used before requesting a new signed URL |

**Status**: PASS

### VII. Monetization Integrity ✅

| Requirement | Plan satisfies it |
|---|---|
| Free/premium enforced server-side | `entitlements` table checked by every premium Edge Function (not client claim); RLS prevents client from reading other users' entitlements |
| Paywall shown before action | `EntitlementService.canInterpret()` / `canGenerateImage()` / `isPremium()` called before action is initiated; paywall screen shown on false; no request made until entitlement confirmed |
| Premium unlocked only after server confirmation | RevenueCat webhook → Supabase Edge Function updates `entitlements.subscription_tier`; client only reflects premium after fetching fresh entitlement from server (not from purchase receipt alone) |

**Status**: PASS

**Post-Phase-1 re-check**: All seven principles pass. No conflicts or violations.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-morpheo-app/
├── plan.md              ← this file
├── research.md          ← Phase 0: all tech decisions resolved
├── data-model.md        ← Phase 1: entity definitions + state transitions
├── quickstart.md        ← Phase 1: validation scenarios
├── contracts/
│   ├── api-endpoints.md         ← REST API + Edge Function contracts
│   └── service-interfaces.md    ← TypeScript adapter interface contracts
└── tasks.md             ← Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
src/
├── app/                          # Expo Router file-based navigation
│   ├── (auth)/                   # Auth stack: onboarding, sign-in, sign-up
│   ├── (main)/                   # Main tab navigator (authed)
│   │   ├── journal/              # Journal list + entry detail
│   │   ├── log/                  # Dream log screen
│   │   ├── insights/             # Recurrence / trends screen
│   │   └── settings/             # Settings, privacy, export, deletion
│   └── _layout.tsx               # Root layout with auth gate
│
├── features/
│   ├── onboarding/               # Onboarding flow steps + consent
│   ├── auth/                     # Auth hooks, lock gate logic
│   ├── dream-log/                # Log, edit, delete dream logic
│   ├── interpretation/           # Request, display, retry interpretation
│   ├── media-generation/         # Image + video generation, regen, safety
│   ├── journal/                  # Journal list, search, filter, detail view
│   ├── recurrence/               # Recurrence display + insights aggregation
│   ├── subscription/             # Entitlement checks, paywall, purchase
│   └── settings/                 # Profile, privacy, notifications, export
│
├── services/                     # Adapter interfaces + concrete implementations
│   ├── ai/
│   │   ├── interpretation/
│   │   │   ├── InterpretationService.ts        # Interface
│   │   │   ├── ClaudeInterpretationService.ts  # Concrete (Claude claude-sonnet-4-6)
│   │   │   └── __mocks__/MockInterpretationService.ts
│   │   ├── image/
│   │   │   ├── ImageGenerationService.ts
│   │   │   ├── DallEImageGenerationService.ts
│   │   │   └── __mocks__/MockImageGenerationService.ts
│   │   └── video/
│   │       ├── VideoGenerationService.ts
│   │       ├── LumaVideoGenerationService.ts
│   │       └── __mocks__/MockVideoGenerationService.ts
│   ├── auth/
│   │   ├── AuthService.ts
│   │   ├── SupabaseAuthService.ts
│   │   ├── LocalLockService.ts
│   │   └── ExpoLocalLockService.ts
│   ├── storage/
│   │   ├── StorageService.ts
│   │   └── ExpoStorageService.ts
│   ├── subscription/
│   │   ├── EntitlementService.ts
│   │   └── RevenueCatEntitlementService.ts
│   ├── notifications/
│   │   ├── NotificationService.ts
│   │   └── ExpoNotificationService.ts
│   └── registry.ts               # Service registry + React context provider
│
├── db/                           # Local SQLite schema and migrations
│   ├── schema.ts                 # Drizzle ORM table definitions
│   ├── migrations/               # Generated migration files
│   └── client.ts                 # SQLite connection singleton
│
├── shared/
│   ├── components/               # Design-system primitives ONLY
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── LoadingState/
│   │   ├── ErrorState/
│   │   └── EmptyState/
│   └── tokens/                   # spacing, typography, colors, shadows
│       ├── spacing.ts
│       ├── typography.ts
│       └── colors.ts
│
└── supabase/                     # Backend (co-located for solo dev convenience)
    ├── functions/
    │   ├── interpret/            # Claude interpretation Edge Function
    │   ├── generate-image/       # DALL-E 3 Edge Function
    │   ├── generate-video/       # Luma async job Edge Function
    │   ├── media-url/            # Signed URL refresh
    │   ├── export-data/          # Data export
    │   ├── account-delete/       # Account deletion
    │   └── webhooks/
    │       └── revenuecat/       # RevenueCat subscription webhook
    ├── migrations/               # PostgreSQL schema migrations
    └── seed/                     # Development seed data

tests/
├── unit/                         # Pure logic: entitlement, recurrence, parsing
├── integration/                  # Auth flow, dream pipeline (with mock services)
└── e2e/                          # Detox/Maestro: full device flows
```

**Structure Decision**: Option 3 (Mobile + API). Feature-based client under `src/features/`; adapter layer under `src/services/`; backend co-located under `src/supabase/` for solo-dev convenience. No global domain-logic `components/` or `utils/` folders — all domain code lives in its feature.

---

## AI Provider Details

### Dream Interpretation: Claude claude-sonnet-4-6

**Call pattern**: Supabase Edge Function (`interpret/`) → Anthropic API → tool_use

**System message construction** (assembled at call time in Edge Function):
```
[base_prompt from system_prompts table (active version)]
[style layer: system_prompts.style_{user_preference}]
Instruction: Respond in the same language the user used to write their dream description.
```

**User message**: The raw dream description text.

**Tool**: `format_interpretation` (full schema in `research.md §5`)

**Degraded state trigger**: `stop_reason !== 'tool_use'` OR `confidence === 'low'`

### Image Generation: DALL-E 3

**Call pattern**: Supabase Edge Function (`generate-image/`) → OpenAI API (synchronous)

**Prompt construction**:
```
[dream_description, truncated to 800 chars]
Rendered in a dreamlike, surreal, cinematic style. Watercolor and digital art aesthetic.
Key symbols: [keywords.slice(0,3).join(', ')]
```

**Parameters**: `model: "dall-e-3"`, `size: "1024x1024"`, `quality: "standard"`, `n: 1`

**Content safety**: DALL-E 3 built-in filtering; a 400 content_policy_violation error is caught and mapped to `ContentSafetyError('output')`.

### Video Generation: Luma Dream Machine v2

**Call pattern**: Supabase Edge Function (`generate-video/`) → Luma API (async)

**Job lifecycle**:
1. POST to Luma API → receive `generation_id`
2. Store `generation_id` in `generation_jobs.external_job_id`
3. Luma webhook (or polling) updates job status
4. On complete: download video → upload to Supabase Storage → update `media` → send push notification

**Estimated latency**: 2-5 minutes for a 5-15s clip.

---

## Auth and Session Architecture

```
App open / foreground
        │
        ▼
LocalLockService.isLockRequired()
        │
   YES  │  NO
        │   └─── render app content
        ▼
LocalLockService.authenticate()
        │
   PASS │  FAIL
        │   └─── lock screen (no content visible)
        ▼
AuthService.getSession()
        │
 VALID  │  EXPIRED
        │   └─── silent refresh (Supabase SDK)
        │             │ FAIL → sign-in screen
        ▼
 render app content
```

- **JWT storage**: `expo-secure-store` key `morpheo_session` (not AsyncStorage)
- **Session lifetime**: Supabase default 1h access token, 30d refresh token
- **Idle timeout**: 5 minutes default; configurable 1-30 minutes in Settings; tracked via `AppState` change events
- **Multi-device**: Each device maintains its own local lock state; backend session is shared; LWW sync on dream edits

---

## Entitlement Enforcement Flow

```
Client action (interpret/image/video)
        │
        ▼
EntitlementService.can{Action}()  ← server call to /rest/v1/entitlements
        │
   true │  false
        │   └─── show paywall screen (before any AI request)
        ▼
POST /functions/v1/{action}  ← Edge Function
        │
        ▼
[Edge Function re-checks entitlements table with service role]
        │
  pass  │  fail (race condition / session mismatch)
        │   └─── return 429; client shows paywall
        ▼
AI provider call
```

**Why double-check**: The client-side check is for UX (show paywall before request). The server-side check is the actual gate (constitution VII). Both are always performed.

---

## Offline Sync Architecture

```
Client saves dream (online or offline)
        │
        ▼
Write to local SQLite (sync_status = 'local')
        │
  online │  offline
        │   └─── stays 'local'; no error
        ▼
POST /rest/v1/dreams (Supabase)
        │
success │  fail
        │   └─── sync_status = 'sync_failed'; retry on reconnect
        ▼
sync_status = 'synced'
```

**Conflict resolution**: On sync, client sends `last_modified_at`. Supabase upsert uses `ON CONFLICT (id) DO UPDATE SET ... WHERE dreams.last_modified_at < EXCLUDED.last_modified_at`. Losing device overwrites on next read (Supabase Realtime or next fetch).

**Delete propagation**: Soft-delete (`is_deleted = true`) syncs to all devices; hard-delete via `DELETE` runs after backend acknowledges the soft-delete.

---

## Complexity Tracking

| Item | Why accepted | Simpler alternative rejected because |
|---|---|---|
| **SQLite encryption via OS FDE instead of SQLCipher** | SQLCipher requires native module compilation → bare Expo workflow. OS-level FDE (iOS Data Protection, Android FBE) provides hardware-backed encryption of the entire app sandbox when device is locked. Combined with the biometric/PIN app gate (which ensures the device itself is locked between sessions), this satisfies the spirit and practical intent of "encrypted at rest." | SQLCipher at the application layer would require ejecting from Expo managed workflow, adding significant build infrastructure for a solo dev. The marginal security gain (app-layer vs. OS-layer encryption) does not justify the maintenance cost for this threat model. |
| **Luma polling/webhook vs. client waiting** | Video generation takes 2-5 minutes — a blocking UI wait is explicitly rejected by the spec and constitution V (explicit state for AI-dependent screens). Async job + push notification is the correct pattern; it is unavoidably more complex than a synchronous call. | A synchronous call would timeout; there is no simpler alternative for a 2-5 minute operation. |
