import { colors, emotionColors, emotionChip } from '../../../src/theme/tokens';

/**
 * WCAG AA contrast gate for the design tokens.
 *
 * The Morpheo palette is deliberately dim and atmospheric, which is exactly the
 * condition under which text contrast quietly fails. These tests are the guard: any
 * future token edit that drops a real text/background pairing below AA fails CI
 * rather than shipping an unreadable screen.
 *
 * Thresholds: 4.5:1 for normal text, 3:1 for large text (>=24px, or >=18.66px bold).
 * Every pairing below is normal-sized in practice, so 4.5 applies throughout.
 */

const AA_NORMAL = 4.5;

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Flattens an 8-digit (#rrggbbaa) colour over an opaque background. */
function flatten(fg: string, bg: string): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(fg);
  if (!m) return fg;
  const alpha = parseInt(m[2]!, 16) / 255;
  const f = channels(`#${m[1]!}`);
  const b = channels(bg);
  const mixed = f.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)));
  return `#${mixed.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Every opaque surface text can land on. */
const SURFACES: Array<[string, string]> = [
  ['background', colors.background],
  ['surface', colors.surface],
  ['surfaceElevated', colors.surfaceElevated],
  // The mystic gradient's lightest stop — the worst case for text on that card.
  ['mystic gradient start', '#241f4d'],
];

/** Text colours used at normal (non-large) sizes. */
const TEXT_COLORS: Array<[string, string]> = [
  ['textPrimary', colors.textPrimary],
  ['textSecondary', colors.textSecondary],
  ['textMuted', colors.textMuted],
  ['accentText', colors.accentText],
  ['highlight', colors.highlight],
  ['textInterpretation', colors.textInterpretation],
  ['error', colors.error],
];

describe('design token contrast (WCAG AA)', () => {
  describe.each(SURFACES)('on %s', (_surfaceName, surface) => {
    it.each(TEXT_COLORS)('%s reaches 4.5:1', (_textName, text) => {
      expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  });

  describe('emotion chips', () => {
    const entries = Object.entries(emotionColors);

    it.each(entries)('%s label is readable on its own chip fill', (_name, hue) => {
      // A chip paints a 12%-alpha fill of its own hue over the card surface.
      const chipBackground = flatten(`${hue}1f`, colors.surface);
      expect(contrastRatio(hue, chipBackground)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it.each(entries)('%s label is readable directly on the app background', (_name, hue) => {
      expect(contrastRatio(hue, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('emotionChip() resolves an unknown emotion to a readable fallback', () => {
      const chip = emotionChip('some-emotion-the-model-invented');
      const background = flatten(chip.fill, colors.surface);
      expect(contrastRatio(chip.text, background)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('emotionChip() is case- and whitespace-insensitive', () => {
      expect(emotionChip('  CALM ').text).toBe(emotionColors.calm);
    });
  });

  it('white on the accent button reaches AA', () => {
    expect(contrastRatio(colors.textOnAccent, colors.accent)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('muted metadata clears AA on the darkest and the lightest surface it uses', () => {
    // Regression guard for the specific value the source design shipped (#6b6882),
    // which failed at 3.60:1 on the background and 2.85:1 on mystic.
    expect(contrastRatio(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(colors.textMuted, '#241f4d')).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
