import { spacing } from '@shared/tokens/spacing';
import { fontSize, fontWeight, lineHeight } from '@shared/tokens/typography';
import { colors } from '@shared/tokens/colors';

describe('spacing tokens', () => {
  it('all named values are defined', () => {
    expect(spacing.xs).toBe(4);
    expect(spacing.sm).toBe(8);
    expect(spacing.md).toBe(16);
    expect(spacing.lg).toBe(24);
    expect(spacing.xl).toBe(32);
    expect(spacing.xxl).toBe(48);
  });
});

describe('typography tokens', () => {
  it('all fontSize values are defined and non-null', () => {
    Object.values(fontSize).forEach(v => {
      expect(v).toBeTruthy();
      expect(typeof v).toBe('number');
    });
  });

  it('all fontWeight values are defined and non-null', () => {
    Object.values(fontWeight).forEach(v => {
      expect(v).toBeTruthy();
    });
  });

  it('all lineHeight values are defined and non-null', () => {
    Object.values(lineHeight).forEach(v => {
      expect(v).toBeTruthy();
      expect(typeof v).toBe('number');
    });
  });
});

describe('color tokens', () => {
  it('dark scheme has all semantic tokens', () => {
    const required = ['background', 'surface', 'text', 'textSecondary', 'accent', 'error', 'success', 'warning'] as const;
    required.forEach(key => {
      expect(colors.dark[key]).toBeTruthy();
    });
  });

  it('light scheme has all semantic tokens', () => {
    const required = ['background', 'surface', 'text', 'textSecondary', 'accent', 'error', 'success', 'warning'] as const;
    required.forEach(key => {
      expect(colors.light[key]).toBeTruthy();
    });
  });

  it('dark and light have same keys', () => {
    const darkKeys = Object.keys(colors.dark).sort();
    const lightKeys = Object.keys(colors.light).sort();
    expect(darkKeys).toEqual(lightKeys);
  });
});
