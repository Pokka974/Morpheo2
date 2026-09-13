# E2E Tests — Morpheo

## Framework

Maestro (preferred for Expo) or Detox.

### Maestro Setup

```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run E2E tests
maestro test tests/e2e/flows/
```

### P1 Core Flow Test

The file `flows/p1-core-flow.yaml` covers the P1 vertical slice, rewritten to match the app's
actual current screens/copy rather than an early spec draft (issue #16 — it had never been
run, and had drifted):
1. Fresh install → onboarding (welcome, consent, PIN setup)
2. Sign up with a random email
3. Log a dream as a draft
4. Open it from the journal list and tap "Interpret this dream"
5. Verify the interpretation renders, and that image generation fires automatically

**Known gap, not covered here:** logging a dream offline and verifying it syncs once
reconnected — the original draft named this as a step but never actually simulated airplane
mode. Worth its own flow rather than folding back into this one.

### Running in CI

`.github/workflows/e2e.yml` runs this against an Android emulator, `workflow_dispatch` only
(not on every push) — it spends EAS build minutes and needs an `EXPO_TOKEN` repo secret that
does not exist yet. See that file's header comment before enabling it further. iOS is out of
scope for CI: this app currently signs with a free Apple developer team (7-day provisioning
profiles), which isn't viable for automated distribution.

Until that secret is added and a first run is supervised, treat this flow as **verified by
reading, not by execution** — every string in it is copied from the screen it targets, but
no one has watched it pass on a device yet.

## Cold Start Profiling (T130)

Run with Expo profile flag:
```bash
npx expo start --profile
```

Target: JS bundle parse + TTI < 2000ms on mid-range Android.

If > 2s: Apply lazy loading for heavy screens in `_layout.tsx`:
- `InsightsScreen` (chart library)
- `RecurrenceAnalyticsView` (chart rendering)
- `PaywallScreen`

## WCAG 2.1 AA Checklist (T131)

Run automated audit:
```bash
# Install axe-react-native
npm install --save-dev axe-core
```

Manual checklist for AI-dependent screens:
- [ ] Color contrast ≥ 4.5:1 for all text (use Colour Contrast Analyser)
- [ ] All interactive elements have `accessibilityLabel`
- [ ] Loading states use `accessibilityLiveRegion="polite"`
- [ ] Error states use `accessibilityLiveRegion="assertive"`
- [ ] InterpretationScreen: loading spinner has accessible label
- [ ] DreamMediaView: image has `accessibilityLabel="Dream illustration"`
- [ ] InsightsScreen: charts have text alternatives
