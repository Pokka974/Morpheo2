# Feature Specification: Morpheo — AI Dream Interpretation App

**Feature Branch**: `001-morpheo-app`

**Created**: 2026-08-14

**Status**: Draft

**Input**: User description: "Build Morpheo: an AI-powered dream interpretation app for iOS and Android."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-Time Onboarding (Priority: P1)

A new user opens the app for the first time. They are guided through a short onboarding
flow that explains the app's purpose (symbolic/cultural dream interpretation — explicitly
not clinical advice), presents a plain-language AI consent screen, and prompts them to set
up a biometric or PIN lock. Only after completing these three steps does the user reach the
account creation screen and the main app.

**Why this priority**: Without informed consent and the local security gate, the app
violates its privacy constitution. This is the entry gate for all users.

**Independent Test**: Can be fully tested on a fresh install — walk through all onboarding
screens end-to-end without an account and verify each screen's content, consent decision
branching, and lock setup enforcement.

**Acceptance Scenarios**:

1. **Given** a fresh app install, **When** the user opens the app, **Then** they see the
   onboarding welcome screen before any other content.
2. **Given** the onboarding flow, **When** the user reaches the consent screen, **Then** it
   states in plain language what data (dream text) is transmitted, to what category of
   provider, and for what purpose — not as a reference to the ToS.
3. **Given** the consent screen, **When** the user declines consent, **Then** they see a
   message explaining that core features require AI processing and they cannot proceed
   without consenting; consent can be revisited at any time in Settings.
4. **Given** consent accepted, **When** the user proceeds, **Then** they are prompted to
   set up biometric lock (if the device supports enrolled biometrics) or a PIN; this step
   cannot be skipped.
5. **Given** all onboarding steps completed, **When** the user taps "Get Started", **Then**
   they are taken to the account creation / sign-in screen.
6. **Given** onboarding already completed on a previous install, **When** the user reinstalls
   the app, **Then** onboarding is shown again (fresh install); account data is restored
   from the backend after sign-in.

---

### User Story 2 — Account Creation and Persistent Authentication (Priority: P1)

A user creates an account with email/password or social login, then remains signed in
across sessions without constant re-authentication to the backend — while still being
required to pass the biometric/PIN lock every time the app opens or after an idle timeout.

**Why this priority**: Account identity anchors all persisted data. The dual-auth model
(backend session + local lock) is a constitution non-negotiable.

**Independent Test**: Create an account, close and reopen the app, verify the local lock
gate fires before any content is visible, and verify the backend session is not re-prompted
if still valid.

**Acceptance Scenarios**:

1. **Given** the account creation screen, **When** the user submits a valid email and
   password, **Then** an account is created, the user is signed in, and they land on the
   main app screen.
2. **Given** the sign-in screen, **When** the user chooses Google or Apple social login,
   **Then** they complete the social auth flow and are signed in to a Morpheo account
   linked to that identity.
3. **Given** an authenticated user who closes and reopens the app, **When** the app
   cold-starts, **Then** the biometric/PIN lock gate is shown before any dream content is
   visible; the backend session is resumed silently without prompting for credentials.
4. **Given** a user idle beyond the configured timeout, **When** they return to the app,
   **Then** the biometric/PIN lock gate re-engages regardless of backend session state.
5. **Given** a backend session that has expired, **When** the user passes the local lock
   and the app detects expiry, **Then** the app attempts a silent background re-auth; if
   it fails, the user is shown a sign-in screen without revealing any dream content until
   re-authentication completes.
6. **Given** a user who cannot pass biometric and has forgotten their PIN, **When** they
   tap "Forgot PIN / Use account password", **Then** they verify identity via their account
   credentials and are prompted to set a new PIN.

---

### User Story 3 — Log a Dream (Priority: P1)

A user opens the dream log screen, writes (or dictates via voice-to-text) a free-text
description of a dream, optionally sets the date the dream occurred (which may be in the
past), and saves. The entry is persisted locally immediately and synced to the backend when
connectivity allows.

**Why this priority**: Dream logging is the foundational input action. Every other feature
— interpretation, imagery, journal, recurrence — requires at least one logged dream.

**Independent Test**: Test entirely offline. Log a dream, verify it appears in the local
journal with a "pending sync" indicator, restore connectivity, verify it syncs without
user action.

**Acceptance Scenarios**:

1. **Given** the dream log screen, **When** the user types a description and taps Save,
   **Then** the entry is persisted locally immediately, a confirmation is shown, and the
   interpretation flow is offered.
2. **Given** the dream log screen, **When** the user taps the voice dictation button,
   **Then** the device's native speech recognition activates and the transcribed text is
   placed in the description field for review before saving.
3. **Given** a dream description shorter than the minimum viable length (under 20
   characters), **When** the user attempts to submit for interpretation, **Then** an inline
   message explains the description is too brief for a meaningful interpretation and gives
   a length guide; saving the raw entry is still permitted.
4. **Given** the date field (which defaults to today), **When** the user taps it, **Then**
   they can select any date up to one year in the past; future dates are disallowed.
5. **Given** the device is offline at save time, **When** the user saves a dream, **Then**
   the entry is saved locally, a subtle "Saved offline — will sync when connected" indicator
   is shown, and no error is presented.
6. **Given** an offline-saved entry, **When** the device regains connectivity, **Then** the
   entry is automatically queued and synced to the backend without user action.
7. **Given** an offline-saved dream queued for sync, **When** connectivity returns but the
   backend session has expired, **Then** the app attempts a silent re-auth and completes the
   sync; if re-auth fails, the user is informed ("Sign in again to sync your offline dreams")
   and the local entry is preserved.
8. **Given** a saved dream entry that already has a completed interpretation and generated
   image, **When** the user edits and saves the dream description, **Then** the app presents
   a prompt: "Your interpretation and image were generated from the previous description.
   Re-generate them with the updated text?" with "Re-generate" and "Keep existing" options;
   the existing interpretation and image remain visible until the user explicitly accepts
   re-generation and the new results are returned.
9. **Given** the re-generation prompt, **When** the user taps "Re-generate", **Then** one
   interpretation credit and one image generation credit are consumed (subject to free-tier
   limits); the re-generation flow is identical to the initial generation flow including all
   loading, error, and safety states.
10. **Given** a saved entry with no interpretation yet, **When** the user edits the
    description, **Then** the edit is applied and saved; no re-generation prompt is shown
    since there is nothing to replace.

---

### User Story 4 — Receive an AI Interpretation (Priority: P1)

After saving a dream, the user requests an AI interpretation and receives a structured
response: a short overall reading, a list of symbolic keywords, the emotions the dream
reflects, and relevant cultural or mythological references. A clear loading state is shown
during generation; a clear, honest error state with a retry option is shown on failure.

**Why this priority**: Interpretation is the core value proposition. Without it, the app
is a plain text journal.

**Independent Test**: Test with a single saved dream entry against mocked AI responses
covering: a valid structured response, an incoherent/empty response, a timeout/network
failure, and a limit-exceeded response.

**Acceptance Scenarios**:

1. **Given** a saved dream entry, **When** the user taps to request an interpretation,
   **Then** the screen immediately shows a loading state for the duration of the request.
2. **Given** a successful AI response, **When** the interpretation is returned, **Then**
   the entry displays all four components: (a) overall reading, (b) symbolic keywords,
   (c) emotions detected, (d) cultural/mythological references with brief explanations.
3. **Given** the AI provider returns an incoherent or empty response, **When** the request
   completes, **Then** the app shows an honest degraded message — it does not display
   fabricated or confident placeholder content.
4. **Given** a network failure or provider timeout, **When** the request fails, **Then**
   the screen shows a clear error state with a "Retry" button; the dream entry is preserved
   unchanged.
5. **Given** the AI provider service is fully unavailable across multiple retries, **When**
   errors persist, **Then** the error state is maintained honestly with a "Try again later"
   message; no partial or invented interpretation is saved.
6. **Given** a free user who has exhausted their monthly interpretation credits, **When**
   they request an interpretation after saving a dream, **Then** the app shows a paywall
   screen before making any AI request; the screen states free vs. premium limits clearly;
   the dream entry is saved but marked uninterpreted.
7. **Given** a free user who passes the client-side credit check but the server returns a
   limit-exceeded response (race condition), **When** the server response arrives, **Then**
   the app surfaces the paywall state; the dream entry is preserved; no partial
   interpretation is stored.
8. **Given** a user who has not granted AI consent, **When** they attempt to trigger
   interpretation, **Then** the app presents the consent prompt before any data is
   transmitted; they may grant consent and proceed, or decline and return to the journal.

---

### User Story 5 — Generate a Dream Image (Priority: P1)

After an interpretation is available, the app generates an AI image illustrating the dream
and attaches it to the journal entry. The image is lazy-loaded and cached locally. A
premium user may additionally generate a short video. The user may regenerate the image
or video within a defined per-entry limit if unsatisfied.

**Why this priority**: Visual illustration is a core differentiating P1 feature that
significantly increases each entry's richness and emotional impact.

**Independent Test**: Test with a saved, interpreted entry against mocked generation
responses: successful image, generation failure, content-safety block, regeneration
limit, and premium video gate.

**Acceptance Scenarios**:

1. **Given** a completed interpretation, **When** image generation starts, **Then** the
   image slot in the journal entry shows a loading state.
2. **Given** a successful generation response, **When** the image is ready, **Then** it is
   attached to the entry, displayed immediately, and cached locally so reopening the entry
   does not re-fetch it from the provider.
3. **Given** an image generation failure (provider error or content-safety block on the
   output), **When** the request fails, **Then** the image slot shows a clear, honest error
   ("Image generation failed — retry or skip") and the interpretation is unaffected.
4. **Given** a dream description that triggers the content-safety filter on input, **When**
   the filter evaluates the description, **Then** image/video generation is blocked before
   any provider call is made and the user sees a clear, non-judgmental message.
5. **Given** a user who dislikes the generated image, **When** they tap "Regenerate",
   **Then** a new image is generated, the original is replaced, and the regeneration count
   for this entry increments.
6. **Given** a free user who has reached the per-entry regeneration limit (3 times),
   **When** they attempt another regeneration, **Then** they are informed the limit for
   this entry is reached; a premium upgrade option is shown.
7. **Given** a premium user, **When** they view an entry, **Then** a "Generate Video"
   option is available in addition to the static image; the regeneration limit for premium
   users is 5 times per entry.
8. **Given** a free user, **When** they tap "Generate Video", **Then** a premium upgrade
   prompt is shown before any request is made.
9. **Given** a video generation failure or content-safety block, **When** the request
   fails, **Then** the video slot shows a clear error state with a retry option; the
   static image (if present) is unaffected.

---

### User Story 6 — Browse the Dream Journal (Priority: P2)

A user views a scrollable list of past dream entries, each showing the date, a short text
snippet, and the generated image thumbnail. The list performs smoothly with hundreds of
entries. Tapping an entry opens the full interpretation and media. The user can also search
by keyword and filter by emotion or date range.

**Why this priority**: The journal is the retention hook — users return to see their
history, not just to log one dream.

**Independent Test**: Seed the journal with a set of entries (no image, image only, video)
and verify list rendering, thumbnail progressive loading, full entry open/close, and
search/filter behavior independently.

**Acceptance Scenarios**:

1. **Given** the journal screen with hundreds of entries, **When** the user scrolls,
   **Then** the scroll is smooth (no perceptible dropped frames) and thumbnails load
   progressively as entries enter the viewport.
2. **Given** a journal entry in the list, **When** the user taps it, **Then** they navigate
   to the full entry view showing: dream text, all four interpretation components, the full
   image or video, and metadata (date logged, date of dream).
3. **Given** the search bar, **When** the user types a keyword, **Then** the list filters to
   entries whose dream text or symbolic keywords contain that term.
4. **Given** the filter panel, **When** the user selects one or more emotion tags, **Then**
   only entries whose interpretation includes those emotions are shown.
5. **Given** the filter panel, **When** the user sets a date range, **Then** only entries
   with a dream date within that range are shown.
6. **Given** a search or filter returning no results, **When** the query is applied,
   **Then** an explicit empty state ("No dreams match this search") is shown — not a blank
   screen.
7. **Given** a user with no logged dreams, **When** they open the journal, **Then** an
   empty state is shown with a prompt to log their first dream.
8. **Given** a journal entry (in the list or full entry view), **When** the user taps
   "Delete entry" and confirms the single confirmation dialog, **Then** the entry, its
   interpretation, and its associated media are permanently deleted; the journal list
   updates immediately; no credit is refunded.
9. **Given** the delete confirmation dialog, **When** the user dismisses it without
   confirming, **Then** the entry is not deleted and the user returns to their previous
   view.

---

### User Story 7 — Recurrence Detection and Insights (Priority: P2)

The app detects when symbols, themes, or emotions appear across multiple dreams and
surfaces this contextually on affected journal entries and on a dedicated Insights screen.
Free users see basic recurrence data (top symbols/emotions, 30-day window). Premium users
see full analytics with selectable time ranges and trend charts.

**Why this priority**: Recurrence insights are the feature that distinguishes Morpheo from
a plain AI interpreter and grow more valuable over time as the journal grows.

**Independent Test**: Seed the journal with entries sharing known symbols and emotions,
run the recurrence engine, and verify expected patterns appear on entries and on the
Insights screen for both free and premium states.

**Acceptance Scenarios**:

1. **Given** an entry whose symbols appear in at least one prior entry in the trailing 30
   days, **When** the entry is viewed, **Then** a recurrence callout is shown (e.g.
   "This symbol has appeared in 3 other dreams this month").
2. **Given** a free user opening the Insights screen, **When** the screen loads, **Then**
   they see the top 3 recurring symbols and top 3 recurring emotions over the past 30 days.
3. **Given** a premium user opening the Insights screen, **When** the screen loads,
   **Then** they see full recurrence analytics: symbol and emotion frequency over selectable
   time ranges (30 days, 90 days, all time), trend indicators, and a list of significant
   recurrences with links to affected entries.
4. **Given** fewer than 3 dream entries in the user's history, **When** the Insights screen
   is opened, **Then** an explicit message is shown ("Log a few more dreams to start seeing
   patterns") — not empty charts.
5. **Given** a new interpretation completes, **When** recurrence analysis runs, **Then** it
   runs without blocking the interpretation display; updated recurrence data is available
   once ready.

---

### User Story 8 — Monetization and Subscription Management (Priority: P2)

Users see a clear free tier and a premium subscription offer. Free vs. premium boundaries
are communicated before the user encounters them mid-action. Premium features are unlocked
only when an active subscription is confirmed server-side. Users can manage and cancel
their subscription within the app.

**Why this priority**: Monetization is required for sustainability and is a constitution
requirement (server-side enforcement, no surprise paywalls).

**Independent Test**: Simulate free and premium entitlement states from the server and
verify gate behavior at each premium feature touch point; verify that a tampered
client-side state does not bypass a server gate.

**Acceptance Scenarios**:

1. **Given** a free user who has not yet encountered a premium feature, **When** they view
   the app, **Then** the free tier limits (5 interpretations/month, 3 image
   generations/month, no video, basic insights) are communicated in the Upgrade screen and
   contextually at each premium feature entry point.
2. **Given** a free user with 1 interpretation remaining for the month, **When** they open
   the log screen, **Then** a subtle indicator ("1 free interpretation remaining — resets
   [Month] 1st") is shown without blocking the action.
3. **Given** a free user who has exhausted their monthly limit, **When** they attempt a
   gated action, **Then** a paywall screen is shown before any request is made; it clearly
   states free vs. premium content before any payment action is presented.
4. **Given** a user who completes a subscription purchase, **When** the payment is
   processed, **Then** the subscription state is confirmed with the backend before any
   premium features unlock; the UI updates only after server confirmation.
5. **Given** a premium user whose subscription has lapsed, **When** they attempt a premium
   action, **Then** the server entitlement check gates the feature and the renewal prompt
   is shown.
6. **Given** the Settings screen, **When** a subscribed user taps "Manage Subscription",
   **Then** they are taken to the platform's native subscription management screen where
   they can modify or cancel.
7. **Given** a user who cancels their subscription, **When** the current paid period ends,
   **Then** they are downgraded to the free tier automatically; existing data is preserved;
   no data is deleted due to tier change.

---

### User Story 9 — Settings and Personalization (Priority: P3)

A user customizes interpretation style (within app-enforced limits), manages notification
reminders, manages privacy/consent settings, and accesses full data export and full account
deletion.

**Why this priority**: Personalization improves experience but does not block the core
loop. Data export and deletion are high ethical priority but low frequency; they are
required by the constitution regardless of P-level.

**Independent Test**: Each setting is independently testable: change style → verify next
interpretation reflects it; toggle notifications → verify OS permission dialog; trigger
export → verify file contents; trigger deletion → verify all backend data is removed.

**Acceptance Scenarios**:

1. **Given** the Settings screen, **When** the user selects an interpretation style preset
   (Symbolic/Archetypal, Mythological/Cultural, or Psychological/Jungian), **Then** the
   next interpretation request applies that style on top of the fixed base prompt; the
   non-clinical framing constraint remains in effect regardless of style choice.
2. **Given** notification settings, **When** the user enables morning reminders and sets a
   time, **Then** the app requests OS notification permission if not already granted and
   schedules a daily reminder at the chosen time.
3. **Given** privacy/consent settings, **When** the user withdraws AI processing consent,
   **Then** the flag is updated; future interpretation and generation requests are blocked
   until consent is re-granted; existing interpretations are not deleted.
4. **Given** the data export option, **When** the user requests a full export, **Then** the
   app generates a file containing all dream entries, all interpretations, and references
   to all generated media; the export is available for download within 5 minutes for
   typical account sizes.
5. **Given** the account deletion option, **When** the user confirms deletion through a
   two-step confirmation dialog, **Then** all user data — entries, interpretations, media,
   credentials — is scheduled for permanent, irreversible deletion from the backend; a
   confirmation is sent to the user; local app data is cleared immediately; deletion
   completes within 30 days.
6. **Given** a subscribed user attempting account deletion, **When** they reach the
   confirmation step, **Then** they are informed that deleting the account will cancel
   their subscription with no refund for the remaining period; they must confirm this
   explicitly before deletion proceeds.

---

### Edge Cases

- **AI service fully down**: Interpretation and image/video requests fail with an honest
  error state and a retry option. No partial or fabricated content is stored. The dream
  entry is always preserved regardless of provider state.
- **Free user hits monthly limit mid-flow (race condition)**: If the client-side check
  passes but the server returns a limit-exceeded response, the paywall state is surfaced;
  the uninterpreted dream entry is preserved; the user is never silently charged or
  left without their saved entry.
- **Offline dream + expired backend session on reconnect**: When connectivity returns,
  the sync queue processes; if the session has expired, a silent re-auth is attempted.
  If re-auth fails (e.g., password changed on another device), the user is prompted with
  "Sign in again to sync your offline dreams." Local dream data is never deleted due to
  sync or auth failure.
- **Dream description below minimum length**: Interpretation and image generation are
  blocked; an inline guide is shown. The raw entry can still be saved so the user does not
  lose text.
- **Content-safety filter triggered on dream input**: Image/video generation is blocked
  before any provider call. A clear, non-judgmental message is shown. The text
  interpretation (which has its own output-layer safety) is not affected by the
  image-input filter.
- **Biometric hardware removed or becomes unavailable after setup**: The app detects the
  unavailability and falls back to PIN lock automatically; the user is notified.
- **Account session expires during interpretation**: Silent re-auth is attempted; on
  failure, the user is prompted to sign in; the saved dream entry is always retained.
- **Client-side subscription state tampered**: Server entitlement check gates all premium
  features; a tampered client state does not unlock any premium capability.
- **Regeneration limit reached**: The per-entry regeneration counter is enforced
  server-side; a client that misreports the count cannot bypass the limit.
- **Concurrent multi-device sync conflict**: If two devices both edited the same DreamEntry
  while offline and sync at the same time, the version with the most recent last-modified
  timestamp wins; the losing version is silently discarded with no notification to the user.
  The winning device's interpretation and media (if any) are preserved; the losing device's
  local copy is overwritten on next sync.
- **Entry deleted on one device, edited on another while both offline**: The deletion takes
  precedence when both changes sync; the edit is discarded along with the entry.
- **Month rollover during an active session**: If a user exhausts their free-tier credits
  on the last day of the month and the month rolls over at 00:00 UTC while the app is
  open, the updated entitlement is reflected on the next server check (e.g., next
  interpretation request); no manual refresh is required.
- **Entry deleted while offline**: The deletion is applied locally immediately and queued
  for backend sync when connectivity returns; the entry disappears from the journal
  immediately on-device regardless of connectivity.
- **Entry deleted while interpretation or media generation is in progress**: Any in-flight
  AI request for that entry is cancelled; partial results are discarded; the entry and all
  associated data are removed.
- **Entry edited while offline**: The edit is saved locally and synced when connected; if
  the entry had a completed interpretation, the re-generation offer is shown after sync
  completes (not while offline, since re-generation requires connectivity).
- **Mixed-language dream input**: If the user writes a dream description that mixes two
  languages, the AI model determines the dominant language for the response; no explicit
  error is raised. If the returned output language does not match the input language, it is
  treated as a degraded response (FR-012 applies) and surfaced honestly.
- **Re-generation fails after editing**: If the user accepts re-generation but the AI
  request fails, the existing (pre-edit) interpretation and media are restored and remain
  visible; the entry retains its edited-since-interpretation flag so the offer can be
  retried.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST present a first-run onboarding flow (welcome → AI consent →
  biometric/PIN setup → account) before displaying the main app to any new user.
- **FR-002**: The consent screen MUST name the AI provider category in plain language and
  state what data is transmitted and for what purpose — not via a reference to the ToS.
- **FR-003**: The app MUST enforce a biometric or PIN lock gate on every app open and after
  every configured idle timeout, independent of backend session state.
- **FR-004**: Users MUST be able to create accounts with email/password or with Google or
  Apple social login.
- **FR-005**: Backend session persistence MUST allow users to remain signed in across cold
  starts without re-entering credentials, provided the session is still valid.
- **FR-006**: Dream entries MUST be saveable offline; offline entries MUST be queued and
  synced automatically when connectivity is restored without user action.
- **FR-007**: Dream descriptions fewer than 20 characters MUST be saveable but MUST NOT be
  submitted for AI interpretation until the threshold is met; an inline guide explains why.
- **FR-008**: Every AI interpretation response MUST include four structured components:
  (a) overall reading, (b) symbolic keywords, (c) emotions, (d) cultural/mythological
  references.
- **FR-009**: Every AI-dependent screen (interpretation, image generation, video generation)
  MUST implement all four states: loading, error (with retry), empty/not-yet-generated,
  and success. All four states are acceptance criteria, not polish.
- **FR-010**: The AI interpretation system prompt MUST be stored and versioned server-side;
  the client MUST NOT hardcode the prompt; the prompt is fetched at runtime. The prompt
  MUST include an instruction to respond in the same language as the user's dream input.
- **FR-011**: A fixed non-clinical framing constraint in the base prompt MUST apply to all
  interpretations in all languages and MUST NOT be overridable by user style preferences.
- **FR-012**: When the AI model returns an incoherent, empty, or low-confidence response,
  the app MUST surface an honest degraded state; fabricating or displaying confident
  placeholder content is prohibited.
- **FR-013**: Generated images and videos MUST be lazy-loaded and cached locally; they MUST
  NOT be re-fetched from the provider each time a journal entry is opened.
- **FR-014**: Content-safety filtering MUST be applied to both the input (dream description)
  and the output (generated image/video) before display; generation MUST be blocked and the
  user informed when a filter triggers.
- **FR-015**: The journal list view MUST paginate or virtualize entries; loading the full
  journal into memory simultaneously is prohibited.
- **FR-016**: The journal list MUST support text search across dream descriptions and
  symbolic keywords, and filtering by emotion tag and date range.
- **FR-017**: The recurrence detection system MUST identify when symbols, themes, or
  emotions appear across multiple entries and surface this on affected entries and on a
  dedicated Insights screen.
- **FR-018**: Free-tier limits MUST be enforced by server-side entitlement checks; the
  client MUST NOT be the sole gate for any premium feature.
- **FR-019**: The paywall screen MUST clearly communicate free vs. premium content before
  presenting any payment action.
- **FR-020**: Premium features MUST NOT be unlocked in the client until the backend
  confirms an active subscription.
- **FR-021**: Users MUST be able to manage and cancel their subscription from within the
  app via the platform-native subscription management flow.
- **FR-022**: Dream text and generated media MUST be encrypted at rest on device and in
  backend storage.
- **FR-023**: Full data export MUST be available from Settings and MUST include all dream
  entries, interpretations, and references to generated media.
- **FR-024**: Full account and data deletion MUST be available from Settings, confirmed via
  a two-step dialog, and MUST result in irreversible removal of all user data from the
  backend within 30 days; local data is cleared immediately on confirmation.
- **FR-025**: AI processing consent status MUST be manageable from Settings; withdrawal of
  consent MUST block future AI requests without deleting existing interpretations.
- **FR-026**: Interpretation style customization MUST offer exactly three defined presets:
  Symbolic/Archetypal, Mythological/Cultural, and Psychological/Jungian; free-text prompt
  overrides by the user are not permitted.
- **FR-027**: Morning reminder notifications MUST be configurable (on/off, time of day) and
  MUST respect the device's notification permission state.
- **FR-028**: AI provider integrations MUST apply a model-training opt-out by default when
  the provider offers one; no user action is required to activate this protection.
- **FR-029**: Image regeneration is limited to 3 per entry for free users and 5 per entry
  for premium users; these limits MUST be enforced server-side.
- **FR-030**: Video generation is a premium-only feature; the option is visible to all
  users, with a premium upgrade prompt shown to free users before any request is made.
- **FR-034**: The app MUST accept dream descriptions written in any language. The AI
  interpretation output — overall reading, symbolic keywords, emotions, and
  cultural/mythological references — MUST be returned in the same language as the input
  dream description. The non-clinical framing constraint in the base prompt MUST be
  enforced regardless of the output language.
- **FR-033**: The app MUST support the same account being actively used on multiple devices
  simultaneously. When two devices sync conflicting versions of the same DreamEntry (e.g.,
  both edited the description while offline), the version with the most recent last-modified
  timestamp MUST be retained; the older version is discarded silently with no merge prompt
  shown to the user.
- **FR-032**: Users MUST be able to permanently delete individual dream entries from the
  journal at any time. Deletion MUST require a single explicit confirmation step. Upon
  confirmed deletion, the entry, its Interpretation, and its MediaSet MUST be permanently
  removed from both the device and the backend. No usage credit is refunded. Deletion is
  not reversible.
- **FR-031**: Users MUST be able to edit the text of a saved dream entry at any time. When
  a description change is saved on an entry that already has a completed interpretation and
  media, the app MUST present an offer to re-generate both (consuming one interpretation
  credit and one image generation credit); the user may accept or decline. Existing
  interpretation and media MUST remain visible and accessible until the user explicitly
  accepts re-generation and the new results are returned successfully.

### Key Entities

- **User**: Holds identity, subscription tier, consent status, style preference, and
  notification settings. Has many DreamEntries.
- **DreamEntry**: The core record. Contains dream text, user-supplied dream date (may
  differ from creation date), a last-modified timestamp (used as the authoritative
  conflict-resolution key in last-write-wins multi-device sync), sync status (local-only /
  synced), an edited-since-interpretation flag (set when the description is changed after a
  completed interpretation, cleared when re-generation is accepted or the user keeps the
  existing result), and links to one Interpretation and one MediaSet.
- **Interpretation**: The structured AI output attached to a DreamEntry. Contains: overall
  reading, symbolic keywords (list), emotions (list), cultural/mythological references
  (list), prompt version reference, degradation flag.
- **MediaSet**: Attached to a DreamEntry. Contains: image asset (with local cache
  reference), optional video asset (premium), content-safety status for input and output,
  regeneration count.
- **RecurrenceRecord**: Aggregated cross-entry pattern keyed by symbol or emotion. Contains:
  term, frequency, affected entry references, first and last seen dates. Derived from
  completed Interpretations.
- **Entitlement**: Server-side record of a User's current tier, monthly usage counters
  (interpretations used, image generations used), and reset date. Counters reset to zero
  at 00:00 UTC on the 1st of each calendar month for all users regardless of signup date.
- **ConsentRecord**: Tracks the user's AI processing consent: current status
  (granted/withdrawn), date granted, provider category disclosed at grant time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user completes the full onboarding flow (welcome → consent → lock
  setup → account creation) in under 3 minutes without external guidance.
- **SC-002**: App cold start completes in under 2 seconds on a mid-range device under
  typical conditions.
- **SC-003**: The journal list view maintains smooth, perceptibly frame-drop-free scroll
  with up to 500 entries on a mid-range device.
- **SC-004**: Saving a dream entry (local persistence) completes in under 2 seconds from
  the moment the user taps Save.
- **SC-005**: AI interpretation results are displayed to the user within 30 seconds of
  request under normal network conditions; a loading state is visible for the full
  duration.
- **SC-006**: A user can complete the core loop — log a dream, receive an interpretation,
  view a generated image — in a single session without encountering an unhandled error.
- **SC-007**: Offline-logged dreams sync automatically within 10 seconds of connectivity
  being restored, without any user action required.
- **SC-008**: Every premium feature gate correctly reflects the server-authoritative
  entitlement state; a tampered client-side state does not unlock any premium capability.
- **SC-009**: Full data export is generated and available for download within 5 minutes for
  an account with up to 500 dream entries and their associated media.
- **SC-010**: Account deletion results in all personal data being irrecoverably removed from
  backend storage within 30 days of confirmation; no personal data is accessible via any
  API after the deletion request is accepted.
- **SC-011**: Every AI-dependent screen handles all four states (loading, error, empty,
  success) without crashing or surfacing an unhandled exception in 100% of tested cases.
- **SC-012**: Content-safety filtering blocks image and video generation before provider
  contact in 100% of cases where the dream description matches defined safety criteria.

## Assumptions

- The minimum viable dream description length for interpretation is 20 characters
  (approximately one short sentence). This default may be tuned based on AI provider
  feedback during integration testing.
- Free tier defaults: 5 interpretations per month, 3 image generations per month, 0 video
  generations, basic recurrence insights (top 3 symbols/emotions, 30-day window). Counters
  reset at 00:00 UTC on the 1st of each calendar month. These limits are business decisions
  subject to revision before launch.
- Voice-to-text uses the device's native speech recognition; no additional AI provider
  consent is required for voice input alone.
- Social login supports Google and Apple at launch; additional providers are out of scope.
- Image generation produces one static image per entry, informed by the dream text and
  symbolic keywords from the interpretation.
- Video generation targets 5–15 seconds in duration; exact format and aspect ratio are
  decisions for the plan phase.
- Notification reminders use the platform's native push notification system; the app
  requests permission through the standard OS permission dialog.
- Recurrence analysis runs automatically after each new interpretation completes; no
  separate user-triggered refresh is needed.
- The backend session token is valid for a duration that makes forced re-authentication
  infrequent (e.g., 30 days); idle timeout for the local lock defaults to 5 minutes and is
  user-configurable within a defined range.
- Data export includes all structured data (entries, interpretations) and a reference
  manifest for media assets. Full media archive download is included in the export package.
- "Full account deletion" is permanent; users are informed they cannot recover data after
  the 30-day deletion window closes.
- Recurrence detection operates on symbolic keywords and emotions from completed
  interpretations; uninterpreted entries do not contribute to recurrence analysis.
- Media cached locally persists until the user clears the app cache; cleared cache does
  not delete the asset from backend storage; the asset is re-fetched on next open.
- The app does not send push notifications for recurrence milestones in this version;
  recurrence is surfaced only within the app's Insights screen and contextually on entries.
- The app UI (navigation labels, buttons, system messages) is English-only for this
  version; only the AI-generated interpretation content responds in the user's input
  language. Full UI localisation is out of scope.

## Clarifications

### Session 2026-08-14

- Q: If a user edits a saved dream description after an interpretation and image have already been generated, what should happen to the existing interpretation and media? → A: Editing is allowed; a prompt asks the user whether to re-generate (consuming a credit); existing results are preserved until re-generation completes successfully.
- Q: Can a user delete an individual dream entry from their journal, and if so, what happens to the interpretation and generated media associated with it? → A: Users can permanently delete individual entries with a single confirmation; the associated interpretation and media are deleted with the entry; no usage credit is refunded.
- Q: Are the monthly free-tier usage limits reset on calendar month boundaries or on a rolling 30-day window? → A: Calendar month — limits reset on the 1st of each calendar month for all users.
- Q: Is Morpheo designed to support the same account being used on multiple devices simultaneously, and how are offline sync conflicts resolved? → A: Multi-device is supported; conflicts are resolved by last-write-wins on the most recent save timestamp per entry, with no merge UI.
- Q: Is Morpheo intended to support users who write dreams in languages other than English, or is the app English-only? → A: Multilingual input is accepted; interpretation output is returned in the same language as the input dream description.

## Non-Goals (Out of Scope for This Version)

- Social or sharing features between users.
- Real-time collaborative dream journals.
- Clinical, therapeutic, or licensed mental health provider integration or claims.
- Web app version.
