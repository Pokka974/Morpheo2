<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 2.0.0
Bump rationale: MAJOR — all four v1 principles redefined with product-specific,
  backward-incompatible rules; three new principles added (Privacy & Data Handling,
  AI Behavior & Safety, Monetization Integrity); Tech Constraints section added;
  Development Workflow and Quality Gates substantially expanded.

Modified principles:
  - I. Code Quality → I. Code Quality
      Redefined: TS strict mode, no-any rule, adapter/interface mandate for all external
      integrations, feature-based folder structure, presentation/domain separation.
      Incompatible with prior generic wording.
  - II. Testing Standards → II. Testing Standards (NON-NEGOTIABLE)
      Redefined: AI mock requirement explicit, domain-specific unit test targets, no-live-API
      rule in CI, "done = has tests" enforced.
  - III. User Experience Consistency → V. UX Consistency
      Renumbered to III→V. Redefined: design system enforcement, offline queueing,
      explicit loading/error/empty/success state requirement.
  - IV. Performance Requirements → VI. Performance
      Renumbered to IV→VI. Targets revised: cold start <2s, 60fps scroll, media caching
      as a defect boundary.

Added principles:
  - III. Privacy and Data Handling (HIGHEST PRIORITY — new)
  - IV. AI Behavior and Safety (new)
  - VII. Monetization Integrity (new)

Added sections:
  - Tech Constraints (fixed platform/infra constraints, not implementation decisions)

Expanded sections:
  - Quality Gates: gates aligned to all 7 principles
  - Development Workflow: adapter-interface review gate added; solo-review attestation model

Removed sections: none — all prior sections retained and expanded.

Follow-up TODOs: none. RATIFICATION_DATE preserved as 2026-08-14.
-->
# Morpheo Constitution

## Core Principles

### I. Code Quality

TypeScript strict mode is mandatory across the entire codebase. `any` is prohibited without
an inline justification comment on the same line explaining why it is unavoidable.

- Code style is enforced by ESLint and Prettier, checked in CI and on pre-commit. No merge
  passes with lint or formatting violations; no manual override without a documented exception.
- The folder structure is feature-based, not type-based. Global `components/`, `utils/`, or
  `helpers/` dumping grounds for domain logic are prohibited. Every file lives in the feature
  it belongs to.
- Business logic MUST NOT live in UI components. A hooks/services layer separates domain
  logic from presentation; components receive data and dispatch actions only.
- Every external integration — AI text generation, AI image/video generation, auth, payments,
  and storage — MUST be wrapped behind an internal interface/adapter. Feature code MUST call
  the adapter, never the provider SDK directly.

Rationale: TypeScript strictness and enforced style prevent a solo codebase from accreting
inconsistency over time. The adapter mandate is the load-bearing constraint that keeps every
provider choice reversible: AI and service providers are not finalized, and swapping one MUST
NOT require touching feature code.

### II. Testing Standards (NON-NEGOTIABLE)

No feature is "done" without tests. This is a portfolio piece that will be read by other
engineers; untested code is incomplete code regardless of how it behaves at runtime.

- Unit tests are required for all business logic: interpretation parsing, recurrence-detection
  logic, and subscription entitlement checks.
- Integration tests are required for auth flows and the dream logging → interpretation →
  journal pipeline.
- AI-dependent code MUST be tested against mocked provider responses. Live API calls are
  prohibited in CI under any circumstance; tests that reach a live provider are invalid.
- A pull request that does not include tests for new or changed logic MUST NOT be merged.

Rationale: Testing enforces the adapter boundary (mocks can only be written if the boundary
exists) and ensures the portfolio demonstrates engineering discipline, not just feature output.

### III. Privacy and Data Handling (HIGHEST PRIORITY)

Dream journals contain sensitive personal data that frequently touches mental health,
relationships, and trauma. Privacy is not a feature — it is a constraint the entire system
is built around, with higher precedence than any other principle when they conflict.

- The app MUST present a biometric or PIN lock gate on every open, independent of the
  backend auth session length. The gate MUST re-engage after a configurable idle timeout.
- Dream text and all generated media MUST be encrypted at rest — on device and in backend
  storage.
- Before any dream content is transmitted to a third-party AI provider, the user MUST
  receive explicit, granular consent in plain language at the point of transmission — not a
  reference to the ToS, not a global setting buried in preferences.
- Full data export and full account/data deletion MUST be accessible from Settings at all
  times. Backend deletion MUST be genuinely irreversible; a soft-delete flag does not
  satisfy this requirement.
- If an AI provider offers an opt-out from using submitted content for model training, the
  integration MUST opt out by default without requiring any user action to enable it.

Rationale: Users logging dreams are trusting the app with material they would not share
publicly. A privacy breach or dark-pattern consent flow causes real harm and collapses the
trust the product's daily-use habit depends on.

### IV. AI Behavior and Safety

The AI interpretation layer carries clinical-adjacent risk because users may be in vulnerable
states when logging dreams. Every design decision in this layer must account for that.

- The system prompt governing dream interpretation MUST be versioned and stored server-side.
  The client MUST fetch it at runtime; hardcoding the prompt in the client binary is
  prohibited. This allows prompt iteration without a client release.
- User-customizable interpretation style layers on top of a fixed base prompt that the user
  cannot fully override. The base prompt MUST enforce non-clinical framing: the app provides
  symbolic and cultural interpretation, not psychological or medical diagnosis, and MUST
  never claim clinical authority.
- Generated interpretations MUST degrade gracefully. When the model returns an incoherent,
  refusal, or low-confidence response, the app MUST surface that honestly — never fabricate
  confident output on a failure.
- Image and video generation MUST apply content-safety filtering on both the input (dream
  description) and the output before display. When a safety check fails, generation is
  blocked and the user is informed; silent alteration or silent failure are both prohibited.

Rationale: "Not a therapist" must be machine-enforced, not just documented intent. A prompt
hardcoded in the client binary is a prompt that cannot be fixed quickly when it causes harm.

### V. UX Consistency

The app presents one coherent experience. Per-screen design invention is a defect.

- A single design system — spacing scale, typography scale, color tokens, and component
  variants — MUST be defined in a shared package and used everywhere. One-off values in
  per-screen stylesheets are a violation of this principle.
- Every AI-dependent screen (interpretation, image generation, video generation) MUST have
  an explicitly designed loading, error, empty, and success state before the screen is
  considered built. These states are acceptance criteria, not post-launch polish.
- Offline behavior is explicit: dream logging MUST work offline and queue for sync when
  connectivity returns. Interpretation and generation features MUST clearly communicate that
  they require connectivity rather than failing silently or displaying a generic error.

Rationale: A design system enforced at the code level is the only mechanism that keeps a
solo-built app consistent as the feature surface grows. States defined upfront eliminate the
"happy path only" failure mode that is common in portfolio projects.

### VI. Performance

Performance targets are acceptance criteria, not aspirational goals.

- Cold start MUST complete in under 2 seconds on a mid-range device.
- The dream list and journal view MUST maintain 60fps scroll even with hundreds of entries.
  Loading the full journal into memory is prohibited; pagination or virtualization is required.
- Generated images and video MUST be lazy-loaded and cached locally. Re-fetching media on
  every journal entry open is a defect, not a performance concern.

Rationale: A slow cold start or a janky journal scroll undermines the daily-use habit the
product depends on and reflects poorly in a portfolio review.

### VII. Monetization Integrity

Subscription and entitlement state is authoritative on the backend, never on the client.

- Free vs. premium feature boundaries MUST be enforced by server-side entitlement checks.
  Client-side state is a display hint only and MUST NOT be the sole gate for any premium
  feature.
- Paywall UX MUST communicate what is free vs. premium before the user initiates a
  gated action — not as a surprise interruption after the user has already committed to the
  flow.

Rationale: Client-only entitlement gates are trivially bypassed and represent a revenue and
trust risk. Surprise paywalls are the fastest path to negative App Store reviews.

## Quality Gates

Every pull request MUST pass all of the following before merge:

- TypeScript compilation with `strict: true`, zero type errors, no unexplained `any`
  (Principle I).
- ESLint and Prettier checks with zero violations (Principle I).
- Full test suite green; no coverage regression on new/modified logic; zero live AI API
  calls in the suite (Principles I, II).
- For any change that touches data transmission, storage, or consent flows: author
  attestation in the PR description that Principle III requirements are satisfied.
- For any change that touches the interpretation prompt, output handling, or content-safety
  filtering: author attestation in the PR description that Principle IV requirements are
  satisfied, and prompt version documented if changed.
- For any change touching the journal list, cold-start path, or media loading: performance
  benchmarks before and after on a mid-range device (Principle VI).
- For any change touching premium features or paywall UX: author attestation that
  server-side enforcement is in place (Principle VII).

A gate MAY be waived only with a maintainer-documented exception in the pull request,
referencing the reason and a tracking issue for resolution. Repeated waivers of the same
gate signal that the gate or the process needs revision and MUST be raised for review.

## Development Workflow

- All work lands via pull request against `main`; direct commits to `main` are prohibited.
- As a solo project, the author self-reviews against this constitution before marking a PR
  ready. For changes touching Principles III, IV, or VII, an async peer review from an
  external collaborator is strongly encouraged.
- Pull request descriptions MUST state what changed, why, and how it was verified — test
  results, benchmarks, device screenshots for UX changes, platform/device for performance
  claims.
- The AI provider adapter interface MUST be reviewed and approved before any concrete
  provider implementation is written. The interface definition is the commitment; the
  implementation is interchangeable.

## Tech Constraints

The following are fixed constraints that inform every feature plan. Implementation specifics
(exact libraries, backend service providers) are decided at the plan phase, not here.

- **Platform**: React Native, cross-platform single codebase, targeting iOS and Android.
- **Solo maintainability**: Prefer managed, boring infrastructure over operational
  complexity. Every infrastructure choice must be operable by one person with no on-call
  burden. Operational complexity that requires a team to sustain is rejected.
- **Provider swappability**: No AI text, AI image/video, auth, payment, or storage provider
  is permanently chosen. The adapter pattern (Principle I) is the mechanism that keeps this
  constraint enforceable throughout the build.

## Governance

This constitution supersedes all other development conventions for Morpheo. All code
reviews, architectural decisions, and acceptance criteria MUST be measured against it.
Deviations require documented justification and maintainer approval.

Amendments MUST be proposed as a pull request against this document, stating the change,
its rationale, and any impact on work already in progress. Amendments take effect on merge.

Versioning follows semantic versioning:
- MAJOR: A principle is removed or its non-negotiable rules are redefined in a
  backward-incompatible way.
- MINOR: A new principle or section is added, or existing guidance is materially expanded.
- PATCH: Clarifications, wording fixes, and non-semantic refinements.

Compliance is reviewed on every pull request. When a PR touches a privacy boundary, AI
behavior, or monetization gate, the author MUST explicitly attest in the PR description
that the relevant principles have been satisfied.

**Version**: 2.0.0 | **Ratified**: 2026-08-14 | **Last Amended**: 2026-08-14
