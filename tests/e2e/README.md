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

The file `flows/p1-core-flow.yaml` covers the full P1 vertical slice:
1. Fresh install → onboarding (consent + PIN setup)
2. Sign up with email
3. Log a dream offline (airplane mode)
4. Return online → verify sync
5. Tap "Interpret Dream" → verify interpretation result renders
6. Verify image generation triggers automatically
7. Verify all 4 interpretation sections render

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
