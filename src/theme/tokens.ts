/**
 * Morpheo design tokens — the single source of truth for every visual value.
 *
 * Ported from the "Morpheo : système de design onirique" Claude Design project.
 * Dark is the app's only theme: these are not "dark overrides" of a light default,
 * they are the palette. A light theme, if it ever ships, derives from these names.
 *
 * Nothing in src/ may hardcode a colour, radius, shadow or font size. ESLint enforces
 * this (react-native/no-color-literals is an error) — extend the tokens instead.
 */

// ---------------------------------------------------------------------------
// Palette — raw values. Prefer the semantic `colors` export in components.
// ---------------------------------------------------------------------------

const palette = {
  night950: '#08080f',
  night900: '#0d0d1a',
  surface: '#16162e',
  surfaceElevated: '#1e1e3c',
  indigoLight: '#2d2d6b',

  purple: '#7c5cbf',
  purpleLight: '#9f7dd8',
  amethyst: '#b399e0',
  amber: '#e0a85c',

  moonWhite: '#f0eeff',
  stardust: '#c8c0e8',
  /**
   * Accessibility divergence from the source design, which specified #6b6882.
   * That value scored 3.60:1 on the app background and 2.85:1 on the mystic
   * surface — below WCAG AA (4.5:1) for the 11–13px metadata it carries, and
   * below even the 3:1 large-text floor on mystic. Lightened 25% toward
   * moonWhite: now 5.75 / 5.27 / 4.80 / 4.55 across background, surface,
   * elevated and mystic. Verified by tests/unit/theme/contrast.test.ts.
   */
  cosmicGray: '#8c8aa1',

  white: '#ffffff',
} as const;

/**
 * Emotion hues — one per feeling, ten in total. Each renders as a chip with a
 * translucent fill and border derived from the same hue (see `emotionChip`).
 * Keys are the canonical emotion identifiers stored in `interpretations.emotions`.
 */
export const emotionColors = {
  calm: '#6fc8b4',
  joy: '#f0b95f',
  freedom: '#7db6ea',
  curiosity: '#9bd47f',
  nostalgia: '#d894c0',
  confusion: '#a68ce8',
  anxiety: '#e08a5c',
  /** Design specified #d2607f — 4.19:1 on its own chip fill, just under AA. +7% light. */
  fear: '#d46a88',
  /** Design specified #e0625c — 4.44:1 on its own chip fill, just under AA. +3% light. */
  anger: '#e06661',
  wonder: '#c9a7f0',
} as const;

export type EmotionKey = keyof typeof emotionColors;

/** Alpha suffixes used to build an emotion chip from its hue (fill 12%, border 25%). */
const EMOTION_FILL_ALPHA = '1f';
const EMOTION_BORDER_ALPHA = '40';

/**
 * Resolves any emotion string to a chip's three colours. Unknown emotions — the AI
 * returns free-form text — fall back to amethyst rather than rendering unstyled.
 */
export function emotionChip(emotion: string): {
  text: string;
  fill: string;
  border: string;
} {
  const key = emotion.trim().toLowerCase() as EmotionKey;
  const hue = emotionColors[key] ?? palette.amethyst;
  return {
    text: hue,
    fill: `${hue}${EMOTION_FILL_ALPHA}`,
    border: `${hue}${EMOTION_BORDER_ALPHA}`,
  };
}

// ---------------------------------------------------------------------------
// Semantic colours
// ---------------------------------------------------------------------------

export const colors = {
  /** Deepest ground — app background behind everything. */
  background: palette.night900,
  /** The canvas beyond the app frame (design-system page ground). */
  backgroundDeep: palette.night950,
  /** Default card and input surface. */
  surface: palette.surface,
  /** Raised surface — pressed rows, thumbnails, secondary cards. */
  surfaceElevated: palette.surfaceElevated,

  /** Hairline between surfaces. */
  border: '#23234a',
  /** Border on a raised / accented surface. */
  borderElevated: '#3a3a6a',
  /** Border on a mystical (interpretation, insight) surface. */
  borderMystic: '#3a2f6b',
  /** Divider inside chrome (tab bar top edge, section rules). */
  divider: '#1c1c38',

  /** Primary action. */
  accent: palette.purple,
  accentBright: palette.purpleLight,
  /** Accent text on dark — the readable amethyst, not the button purple. */
  accentText: palette.amethyst,

  /**
   * Amber is reserved for exactly two things: positive emotions and the lucid-dream
   * marker. Never for a destructive action.
   */
  highlight: palette.amber,

  textPrimary: palette.moonWhite,
  textSecondary: palette.stardust,
  /** Metadata, timestamps, counters, placeholders. */
  textMuted: palette.cosmicGray,
  /** Text on a filled accent button. */
  textOnAccent: palette.white,
  /** Body copy inside the interpretation card — a touch warmer than moonWhite. */
  textInterpretation: '#e6e2f8',

  error: emotionColors.anger,
  errorSurface: '#e0666114',
  errorBorder: '#e066613d',

  /** Confirmation copy (export finished, consent granted). */
  success: '#7ed08a',
  successSurface: '#1a2e1a',

  /** Destructive surfaces — account deletion, revoke. Amber is never used here. */
  destructiveSurface: '#2a1a1a',
  destructiveSurfaceStrong: '#3a1a1a',

  /** Full-screen dim behind a modal. */
  scrim: 'rgba(0,0,0,0.7)',

  /** Text input ground. */
  inputSurface: palette.surface,

  /** Neutral chip (keywords, cultural references) — no emotional hue. */
  chipNeutralFill: palette.night900,
  chipNeutralBorder: '#3a3a6a',

  /** Explicit no-fill, so outlined and ghost surfaces still go through the tokens. */
  transparent: 'transparent',
} as const;

// ---------------------------------------------------------------------------
// Gradients — consumed by expo-linear-gradient / react-native-svg
// ---------------------------------------------------------------------------

/** Each gradient is `colors` + the stop positions expo-linear-gradient expects. */
export const gradients = {
  /** Falling asleep. */
  descent: {
    colors: [palette.night900, palette.indigoLight, palette.purple] as const,
    locations: [0, 0.55, 1] as const,
  },
  /** Waking / morning reminder. */
  dawn: {
    colors: ['#1a1a3e', palette.purple, palette.amethyst, palette.amber] as const,
    locations: [0, 0.45, 0.78, 1] as const,
  },
  /** Mystical card ground (interpretation, insight of the week). */
  mystic: {
    colors: ['#2a2456', palette.surface] as const,
    locations: [0, 1] as const,
  },
  /** Interpretation card — slightly deeper than `mystic`. */
  interpretation: {
    colors: ['#241f4d', palette.surface] as const,
    locations: [0, 1] as const,
  },
  /** Quota / usage meter fill. */
  meter: {
    colors: [palette.purple, palette.amber] as const,
    locations: [0, 1] as const,
  },
  /** Centre action button. */
  fab: {
    colors: [palette.purpleLight, palette.purple] as const,
    locations: [0, 1] as const,
  },
  /** Scrim over a generated visual so text stays legible on any image. */
  imageScrim: {
    colors: ['transparent', 'rgba(13,13,26,0.85)'] as const,
    locations: [0.4, 1] as const,
  },
} as const;

/** Constellation card ground — a radial in the design, approximated as a diagonal. */
export const constellationBackground = {
  colors: ['#241f4d', '#0f0f22'] as const,
  locations: [0, 0.72] as const,
} as const;

/** Emotion-ribbon stops (SVG linear gradient, wake → deep sleep → dawn). */
export const ribbonStops = [
  { offset: '0', color: palette.indigoLight, opacity: 1 },
  { offset: '0.42', color: palette.purple, opacity: 1 },
  { offset: '0.74', color: palette.amethyst, opacity: 1 },
  { offset: '1', color: palette.amber, opacity: 1 },
] as const;

export const ribbonFillStops = [
  { offset: '0', color: palette.indigoLight, opacity: 0.35 },
  { offset: '0.5', color: palette.purple, opacity: 0.3 },
  { offset: '1', color: palette.amber, opacity: 0.22 },
] as const;

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  /** Buttons. */
  button: 10,
  /** Thumbnails, small tiles. */
  thumb: 12,
  /** Cards. */
  card: 16,
  /** Chips and pills. */
  chip: 20,
  /** Large panels (constellation, ribbon). */
  panel: 20,
  /** Bottom sheets. */
  sheet: 28,
  /** Fully round. */
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * Two families, one rule: Fraunces carries the dream — its title, its narrative and
 * the AI's voice. Everything interactive stays in Manrope.
 *
 * Names match the loaded @expo-google-fonts modules.
 */
export const fontFamily = {
  ui: 'Manrope_500Medium',
  uiSemiBold: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  uiExtraBold: 'Manrope_800ExtraBold',
  uiRegular: 'Manrope_400Regular',
  dream: 'Fraunces_400Regular',
  dreamMedium: 'Fraunces_500Medium',
  dreamItalic: 'Fraunces_400Regular_Italic',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  display: 40,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  extraBold: '800',
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
} as const;

/**
 * Ready-made text styles. Line heights are absolute px (React Native does not accept
 * a unitless multiplier) and sit at or above 1.2× the size so no accent clips.
 */
export const typography = {
  display: {
    fontFamily: fontFamily.uiExtraBold,
    fontSize: fontSize.display,
    lineHeight: 44,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  screenTitle: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.xxl,
    lineHeight: 37,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontFamily: fontFamily.uiSemiBold,
    fontSize: fontSize.xl,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  cardTitle: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: fontFamily.ui,
    fontSize: fontSize.md,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  meta: {
    fontFamily: fontFamily.ui,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMuted,
  },
  /** Uppercase eyebrow above a section or a badge. */
  overline: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.xs,
    lineHeight: 16,
    letterSpacing: 1.8,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  /** Dream title — Fraunces. */
  dreamTitle: {
    fontFamily: fontFamily.dreamMedium,
    fontSize: 21,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  /** Dream narrative — Fraunces. */
  dreamBody: {
    fontFamily: fontFamily.dream,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textSecondary,
  },
  /** The AI's voice — Fraunces, roomier. */
  interpretationBody: {
    fontFamily: fontFamily.dream,
    fontSize: 15.5,
    lineHeight: 26,
    color: colors.textInterpretation,
  },
  /** Pull quote — Fraunces italic. */
  dreamQuote: {
    fontFamily: fontFamily.dreamItalic,
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic' as const,
    color: colors.textPrimary,
  },
  button: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.md,
    lineHeight: 20,
  },
  chip: {
    fontFamily: fontFamily.uiSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  tabLabel: {
    fontFamily: fontFamily.uiSemiBold,
    fontSize: 10,
    lineHeight: 13,
  },
} as const;

// ---------------------------------------------------------------------------
// Glows — this system has no drop shadows, only light
// ---------------------------------------------------------------------------

/**
 * Elevation reads as emitted light, never as a cast shadow. Values are RN shadow
 * props with zero offset; `elevation` keeps Android in step.
 */
export const glow = {
  none: {},
  /** A surface that is quietly lit. */
  soft: {
    shadowColor: palette.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  /** A primary action. */
  action: {
    shadowColor: palette.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 17,
    elevation: 10,
  },
  /** The amber lucid / premium marker. */
  highlight: {
    shadowColor: palette.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// Touch targets
// ---------------------------------------------------------------------------

/** Minimum interactive size. Below this a control is not reachably tappable. */
export const MIN_TOUCH_TARGET = 44;

/** Tab bar item and centre action button. */
export const sizes = {
  tabItem: 56,
  fab: 58,
  /** How far the centre action rises above the bar. */
  fabLift: 26,
  avatar: 42,
  thumbSmall: 58,
  thumbMedium: 60,
} as const;

export const tokens = {
  colors,
  emotionColors,
  gradients,
  spacing,
  radius,
  typography,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  glow,
  sizes,
} as const;
