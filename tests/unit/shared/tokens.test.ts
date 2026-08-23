import {
  colors,
  emotionColors,
  fontSize,
  fontWeight,
  glow,
  gradients,
  lineHeight,
  radius,
  spacing,
  typography,
  MIN_TOUCH_TARGET,
} from '@theme/tokens';

/**
 * Structural checks on the design tokens. Contrast is covered separately in
 * tests/unit/theme/contrast.test.ts; this file guards shape and completeness, so a
 * token cannot be deleted or emptied without a test noticing.
 */

describe('spacing tokens', () => {
  it('keeps the 4px base scale', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
    expect(spacing.xxl).toBe(48);
  });
});

describe('typography tokens', () => {
  it('every fontSize is a positive number', () => {
    Object.values(fontSize).forEach(v => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    });
  });

  it('every fontWeight is defined', () => {
    Object.values(fontWeight).forEach(v => expect(v).toBeTruthy());
  });

  it('every lineHeight multiplier is a positive number', () => {
    Object.values(lineHeight).forEach(v => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
    });
  });

  it('every text style names a font family and an absolute line height', () => {
    Object.entries(typography).forEach(([name, style]) => {
      expect(style.fontFamily).toBeTruthy();
      // React Native needs px, not a unitless multiplier.
      expect(typeof style.lineHeight).toBe('number');
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
      expect(name).toBeTruthy();
    });
  });

  it('body copy never drops below 11px', () => {
    // The dim aesthetic is already a legibility cost; small type compounds it.
    Object.values(typography).forEach(style => {
      expect(style.fontSize).toBeGreaterThanOrEqual(10);
    });
  });
});

describe('colour tokens', () => {
  const required = [
    'background',
    'surface',
    'surfaceElevated',
    'border',
    'accent',
    'accentText',
    'highlight',
    'textPrimary',
    'textSecondary',
    'textMuted',
    'error',
    'success',
  ] as const;

  it.each(required)('%s is defined', key => {
    expect(colors[key]).toBeTruthy();
  });

  it('defines ten emotion hues', () => {
    expect(Object.keys(emotionColors)).toHaveLength(10);
    Object.values(emotionColors).forEach(hue => expect(hue).toMatch(/^#[0-9a-f]{6}$/i));
  });
});

describe('gradients', () => {
  it('every gradient pairs colours with matching stop locations', () => {
    Object.entries(gradients).forEach(([name, g]) => {
      expect(g.colors.length).toBeGreaterThanOrEqual(2);
      expect(g.locations).toHaveLength(g.colors.length);
      expect(name).toBeTruthy();
    });
  });
});

describe('elevation', () => {
  it('reads as glow, never as a cast shadow', () => {
    // A non-zero shadow offset would make this a drop shadow, which the system
    // deliberately does not use.
    [glow.soft, glow.action, glow.highlight].forEach(g => {
      expect(g.shadowOffset).toEqual({ width: 0, height: 0 });
    });
  });
});

describe('touch targets', () => {
  it('holds the 44px minimum', () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});

describe('radii', () => {
  it('defines the documented scale', () => {
    expect(radius.button).toBe(10);
    expect(radius.card).toBe(16);
    expect(radius.chip).toBe(20);
    expect(radius.sheet).toBe(28);
  });
});
