import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@theme/tokens';

interface Props {
  /** 1–5 (or 1–4 for symbolic density). Values outside the range are clamped rather
   * than throwing. */
  value: number;
  max?: number;
  /** Dot diameter in px — the design uses 4px on cards, 5px in the detail context box. */
  size?: number;
  /** `circle` for clarity/sleep-quality dots; `diamond` for symbolic density, matching
   * the design's distinct mark for the AI-generated metadata block. */
  shape?: 'circle' | 'diamond';
  accessibilityLabel: string;
  style?: ViewStyle;
}

/**
 * Read-only N-of-max dot/diamond indicator — the card and detail-view counterpart to
 * `RatingScale`'s editable dots. Kept separate because these never respond to touch
 * and render much smaller (4–7px) than an interactive control ever could.
 */
export function ClarityDots({
  value,
  max = 5,
  size = 4,
  shape = 'circle',
  accessibilityLabel,
  style,
}: Props) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  const steps = Array.from({ length: max }, (_, i) => i + 1);
  const shapeStyle =
    shape === 'diamond'
      ? { width: size, height: size, borderRadius: size * 0.15, transform: [{ rotate: '45deg' }] }
      : { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      style={[styles.row, style]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {steps.map(step => (
        <View
          key={step}
          style={[shapeStyle, step <= filled ? styles.filled : styles.idle]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  filled: {
    backgroundColor: colors.accentText,
  },
  idle: {
    backgroundColor: colors.borderElevated,
  },
});
