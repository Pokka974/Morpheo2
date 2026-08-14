# Quickstart Validation Guide: Morpheo

**Branch**: `001-morpheo-app` | **Date**: 2026-08-14

This guide describes how to validate that each major feature works end-to-end. It is
not an implementation guide — it assumes the app and backend are running. Each scenario
references the relevant spec acceptance criteria.

Prerequisites and expected outcomes are stated per scenario. Use mocked AI providers
(see §0) for CI runs; use real providers for manual/integration validation.

---

## §0 — Test Infrastructure Prerequisites

### AI Provider Mocks (CI / unit tests)

All three AI services MUST be testable via mocks. Each service interface (see
`contracts/service-interfaces.md`) must have a corresponding mock implementation:

| Real service | Mock | Location |
|---|---|---|
| `ClaudeInterpretationService` | `MockInterpretationService` | `src/services/ai/interpretation/__mocks__/` |
| `DallEImageGenerationService` | `MockImageGenerationService` | `src/services/ai/image/__mocks__/` |
| `LumaVideoGenerationService` | `MockVideoGenerationService` | `src/services/ai/video/__mocks__/` |

Mock implementations must support configurable response scenarios:
- `success` — returns valid structured data
- `degraded` — returns `isDegraded: true` with empty fields
- `failure` — throws `InterpretationProviderError`
- `limit_exceeded` — throws `InterpretationLimitError`
- `safety_blocked` — throws `ContentSafetyError`

### Local Development Prerequisites

- Supabase project running (local via `supabase start` or hosted)
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LUMA_API_KEY` in Supabase Edge Function secrets
- `REVENUECAT_API_KEY` in Supabase Edge Function secrets (for webhook validation)
- Expo Go or development build on a physical device (biometric requires real hardware)

---

## §1 — Onboarding Flow

**Validates**: User Stories 1 & 2, FR-001 – FR-005, SC-001

### Scenario 1.1: Full onboarding → account creation (fresh install)

**Prerequisites**: Fresh app install (or cleared app data), no existing account.

**Steps**:
1. Open the app for the first time
2. Verify the welcome screen appears (no journal content visible)
3. Progress through the onboarding screens
4. On the consent screen: verify the provider category is named in plain language
5. Grant consent
6. Verify the PIN/biometric setup screen appears and cannot be skipped
7. Set a PIN
8. Create a new account with email + password

**Expected outcomes**:
- All four onboarding screens appear in order: welcome → consent → lock setup → account
- Declining consent on step 4 shows a blocking message; consent can be revisited
- PIN setup enforced — tapping "Skip" (if present) is disallowed
- Account created; user lands on the main journal screen
- Total time: under 3 minutes (SC-001)

### Scenario 1.2: App re-open triggers local lock gate

**Prerequisites**: Completed onboarding; account signed in.

**Steps**:
1. Open the app
2. Navigate to the journal
3. Background the app for > 5 minutes (idle timeout)
4. Foreground the app

**Expected outcomes**:
- On step 4: biometric/PIN gate appears before any journal content is visible
- Passing the gate reveals the journal
- No backend re-authentication prompt (session still valid)

### Scenario 1.3: Google Sign-In flow

**Prerequisites**: Fresh install; Google account available.

**Steps**:
1. Complete onboarding (consent + PIN)
2. On account screen, tap "Continue with Google"
3. Complete the Google OAuth flow
4. Verify landing on main app screen

**Expected outcome**: Account created and signed in via Google. User lands on journal.

---

## §2 — Dream Logging (Online + Offline)

**Validates**: User Story 3, FR-006 – FR-007, SC-004, SC-007

### Scenario 2.1: Log a dream online

**Prerequisites**: Signed in, device online.

**Steps**:
1. Tap "Log a Dream"
2. Type a dream description (>20 chars)
3. Set a past date (e.g., yesterday)
4. Tap Save

**Expected outcomes**:
- Entry saved locally and synced to backend within a few seconds (SC-004: <2s local save)
- Confirmation shown; interpretation flow offered
- Entry appears at the top of the journal list

### Scenario 2.2: Log a dream offline

**Prerequisites**: Signed in, **device offline** (disable Wi-Fi + cellular).

**Steps**:
1. Tap "Log a Dream"
2. Type a dream description
3. Tap Save

**Expected outcomes**:
- Entry saved immediately with a "Saved offline — will sync when connected" indicator
- No error shown; interpretation flow is NOT offered (requires connectivity)
- Entry appears in the journal list with a sync-pending indicator

### Scenario 2.3: Offline entry syncs on reconnect

**Prerequisites**: Completed Scenario 2.2; entry is pending sync.

**Steps**:
1. Re-enable device connectivity

**Expected outcomes**:
- Within 10 seconds, the pending entry is synced to the backend (SC-007)
- Sync-pending indicator disappears from the journal entry
- Interpretation flow is now offered on the entry

### Scenario 2.4: Description too short

**Steps**:
1. Tap "Log a Dream"
2. Type fewer than 20 characters
3. Tap Save — verify the entry saves (raw text)
4. Tap "Interpret" on the saved entry

**Expected outcomes**:
- Save succeeds (short entries are permitted to save)
- On step 4: an inline message explains the description is too short for interpretation, with a minimum length guide; interpretation is blocked

---

## §3 — AI Interpretation

**Validates**: User Story 4, FR-008 – FR-012, FR-034, SC-005, SC-011

### Scenario 3.1: Successful interpretation (using real or mock provider)

**Prerequisites**: A saved dream entry with description > 20 chars; AI consent granted; free credits remaining.

**Steps**:
1. Open the saved dream entry
2. Tap "Interpret"
3. Observe the loading state

**Expected outcomes**:
- Loading state shows for the duration of the request
- Response arrives within 30 seconds on a normal connection (SC-005)
- Four components displayed: overall reading, keywords, emotions, cultural references
- All text is in the same language as the input dream description (FR-034)
- Non-clinical framing in the reading — no diagnostic language

### Scenario 3.2: Degraded interpretation (mock: low confidence)

**Prerequisites**: `MockInterpretationService` configured to return `isDegraded: true`.

**Steps**:
1. Trigger interpretation

**Expected outcomes**:
- Honest degraded message shown ("We couldn't generate a clear interpretation…")
- No fabricated content displayed
- Retry button available

### Scenario 3.3: Provider failure (mock: throws InterpretationProviderError)

**Expected outcomes**:
- Clear error state with "Retry" button
- Dream entry preserved unchanged

### Scenario 3.4: Monthly limit exceeded (mock: throws InterpretationLimitError)

**Steps**:
1. Mock `canInterpret()` to return `false`
2. Attempt interpretation

**Expected outcomes**:
- Paywall screen shown BEFORE any AI request is made
- Screen states free vs. premium limits and reset date
- Dream entry preserved (uninterpreted)

### Scenario 3.5: Interpretation without AI consent

**Prerequisites**: `profiles.ai_consent_granted = false`.

**Steps**:
1. Attempt to interpret a dream

**Expected outcomes**:
- Consent prompt shown at point of interpretation request
- User can grant consent and proceed, or decline and return to journal

---

## §4 — Image Generation

**Validates**: User Story 5, FR-013 – FR-014, FR-029, SC-011, SC-012

### Scenario 4.1: Successful image generation

**Prerequisites**: Saved dream with completed interpretation.

**Expected outcomes**:
- Image loading state shown
- Image displayed after generation (~10-20s with DALL-E 3)
- Image cached locally; reopening the entry does not trigger a network request (SC-013 equivalent; see FR-013)

### Scenario 4.2: Content safety block (input)

**Prerequisites**: `MockImageGenerationService` configured to throw `ContentSafetyError('input')`.

**Expected outcomes**:
- Generation blocked before any provider call (SC-012: 100% of cases)
- Clear, non-judgmental message shown in the image slot
- Interpretation unaffected

### Scenario 4.3: Regeneration limit enforcement

**Steps**:
1. Generate an image successfully (regeneration_count = 0)
2. Tap "Regenerate" 3 times (reaches free-tier limit of 3)
3. Tap "Regenerate" a 4th time

**Expected outcomes**:
- Steps 1-3: Each regeneration replaces the previous image; count increments
- Step 4: User informed the limit is reached; premium upgrade prompt shown
- Verify server-side: `media.regeneration_count` does not exceed `max_regenerations`

### Scenario 4.4: Image generation failure → entry unaffected

**Prerequisites**: `MockImageGenerationService` throws `InterpretationProviderError`.

**Expected outcomes**:
- Error state shown in image slot with retry option
- Interpretation text and all other entry data intact

---

## §5 — Video Generation (Premium, Async)

**Validates**: User Story 5, FR-030, SC-011

### Scenario 5.1: Premium user submits video job

**Prerequisites**: `subscription_tier = 'premium'`; entry has completed image.

**Steps**:
1. Open a journal entry
2. Tap "Generate Video"
3. Observe the submitted state

**Expected outcomes**:
- `202 Accepted` returned immediately
- "Generating your video… we'll notify you when it's ready" state shown
- Realtime subscription active on `generation_jobs:id=eq.{job_id}`
- On completion: media record updated; push notification received; video playable in entry

### Scenario 5.2: Free user encounters video gate

**Steps**:
1. Sign in as a free user
2. Open a journal entry
3. Tap "Generate Video"

**Expected outcomes**:
- Premium upgrade prompt shown BEFORE any request is made (FR-030)
- No job created on backend

### Scenario 5.3: Video generation failure

**Prerequisites**: Mock Luma to return a failed job status.

**Expected outcomes**:
- Video slot shows error state with retry option
- Static image (if present) unaffected

---

## §6 — Journal Browse, Search, and Filter

**Validates**: User Story 6, FR-015 – FR-016, SC-002, SC-003

### Scenario 6.1: Journal list performance

**Prerequisites**: Seed database with 200+ dream entries with images.

**Steps**:
1. Open the journal (cold start)
2. Scroll continuously from top to bottom

**Expected outcomes**:
- Cold start under 2 seconds (SC-002)
- Scroll is smooth with no perceptible frame drops (SC-003: 60fps)
- Images lazy-load as entries enter the viewport; not pre-fetched
- All 200+ entries browsable (pagination/virtualization confirmed by inspecting that not all data is in memory)

### Scenario 6.2: Keyword search

**Steps**:
1. Open journal
2. Type "water" in the search bar

**Expected outcomes**:
- List filters to entries containing "water" in dream text or symbolic keywords
- Results appear within 1 second
- Empty state shown if no results match

### Scenario 6.3: Filter by emotion + date range

**Steps**:
1. Open filter panel
2. Select emotion "anxiety"
3. Set date range: last 30 days

**Expected outcomes**:
- List shows only entries matching both criteria
- Explicit empty state if no matches

### Scenario 6.4: Entry deletion

**Steps**:
1. Long-press (or swipe) on a journal entry
2. Tap "Delete"
3. Confirm in the single confirmation dialog

**Expected outcomes**:
- Entry removed from the list immediately
- Backend deletion queued and confirmed
- No credit refunded (entitlement counters unchanged)

---

## §7 — Recurrence Detection

**Validates**: User Story 7, FR-017

### Scenario 7.1: Recurrence callout on entry

**Prerequisites**: Seed 4+ dreams, all containing the keyword "water" in their interpretations.

**Steps**:
1. Open one of the "water" dreams

**Expected outcomes**:
- Recurrence callout visible: "This symbol has appeared in X other dreams this month"

### Scenario 7.2: Free-tier Insights screen

**Prerequisites**: User on free tier; multiple dreams with recurrences.

**Steps**:
1. Open the Insights tab

**Expected outcomes**:
- Top 3 recurring keywords and top 3 recurring emotions shown (30-day window)
- "Upgrade for full analytics" prompt visible

### Scenario 7.3: Premium Insights screen

**Prerequisites**: User on premium tier.

**Expected outcomes**:
- Full analytics: time range selector (30d / 90d / all time), trend charts, full recurrence list with links to affected entries

---

## §8 — Subscription and Entitlement

**Validates**: User Story 8, FR-018 – FR-021, SC-008

### Scenario 8.1: Server-side gate cannot be bypassed

**Steps**:
1. On a free-account device, manually modify the client-side Zustand entitlement store to show `premium`
2. Attempt to generate a video

**Expected outcomes**:
- Edge Function checks `entitlements` table (not client claim)
- `403 Forbidden` returned
- Premium gate shown despite client-side state manipulation

### Scenario 8.2: RevenueCat webhook updates entitlement

**Steps**:
1. Simulate a RevenueCat `INITIAL_PURCHASE` webhook to `POST /functions/v1/webhooks/revenuecat`
2. Fetch `GET /rest/v1/entitlements?user_id=eq.{uid}`

**Expected outcomes**:
- `subscription_tier` updated to `'premium'`
- Client fetches fresh entitlement on next check and unlocks premium features

### Scenario 8.3: Subscription expiry downgrades to free

**Steps**:
1. Simulate `EXPIRATION` webhook

**Expected outcomes**:
- `entitlements.subscription_tier` → `'free'`
- On next app open, premium features are gated

---

## §9 — Privacy: Data Export and Account Deletion

**Validates**: User Story 9, FR-022 – FR-025, SC-009, SC-010

### Scenario 9.1: Data export

**Steps**:
1. Navigate to Settings → Data & Privacy → Export My Data
2. Tap "Export"

**Expected outcomes**:
- Confirmation shown; export queued
- Export file available within 5 minutes for a typical account (SC-009)
- File contains: all dream entries (text, dates), all interpretations, media manifest
- Download link delivered in-app and via email

### Scenario 9.2: Account deletion

**Steps**:
1. Navigate to Settings → Data & Privacy → Delete Account
2. Read the two-step confirmation (warns about subscription cancellation)
3. Confirm deletion

**Expected outcomes**:
- User is immediately signed out of all devices
- Confirmation sent to email
- Within 30 days: all data irrecoverably removed from backend (SC-010)
- No personal data accessible via API after request confirmed
- Local SQLite data cleared immediately

---

## §10 — Entry Editing (Clarification Q1)

**Validates**: FR-031, User Story 3 scenarios 8-10

### Scenario 10.1: Edit with re-generation offer

**Prerequisites**: Dream entry with completed interpretation and image.

**Steps**:
1. Open the entry; tap "Edit"
2. Modify the description text
3. Tap Save

**Expected outcomes**:
- Prompt appears: "Re-generate interpretation and image with updated text?"
- Tapping "Keep existing": entry text updated; interpretation and image unchanged; edited_since_interpretation flag set
- Tapping "Re-generate": consumes one interpretation credit + one image credit; re-generation flow begins; old results shown until new ones are returned

### Scenario 10.2: Edit when no interpretation exists

**Steps**:
1. Save a dream without interpreting it
2. Edit the description
3. Tap Save

**Expected outcomes**:
- Entry saved; no re-generation prompt (nothing to replace)
