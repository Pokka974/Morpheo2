import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme/tokens';

export type RatingScaleVariant = 'dot' | 'bar';

interface Props {
  label: string;
  /** 1–5, or `null` for "not set yet". */
  value: number | null;
  onChange: (value: number) => void;
  /** `dot` is the design's sleep-quality control; `bar` is used for clarity and stress. */
  variant?: RatingScaleVariant;
  max?: number;
  /** Spoken per step, e.g. "Sleep quality, 4 of 5". */
  accessibilityLabel?: (step: number) => string;
  testID?: string;
}

/**
 * The design's 1–5 rating row, in its two visual forms: a row of dots (sleep
 * quality) or a row of taller segments (dream clarity, day stress). Both share one
 * control because they are the same interaction — tap a step to set the value — and
 * differ only in the shape drawn per step.
 */
export function RatingScale({
  label,
  value,
  onChange,
  variant = 'dot',
  max = 5,
  accessibilityLabel,
  testID,
}: Props) {
  const steps = Array.from({ length: max }, (_, i) => i + 1);

  const isBar = variant === 'bar';

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, isBar && styles.rowBar]} accessibilityRole="adjustable">
        {steps.map(step => {
          const filled = value != null && step <= value;
          return (
            <Pressable
              key={step}
              onPress={() => onChange(step)}
              hitSlop={spacing.xs}
              accessibilityRole="button"
              accessibilityState={{ selected: filled }}
              accessibilityLabel={accessibilityLabel?.(step) ?? `${label} ${step}/${max}`}
              style={[styles.hit, isBar && styles.hitBar]}
            >
              <View
                style={[
                  isBar ? styles.bar : styles.dot,
                  filled
                    ? isBar
                      ? styles.barFilled
                      : styles.dotFilled
                    : isBar
                      ? styles.barIdle
                      : styles.dotIdle,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs + 2,
  },
  label: {
    ...typography.overline,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  // The bar variant is the design's full-width scale (dream clarity, day stress):
  // every segment shares the row equally rather than clustering at a fixed size on
  // the left, so `hitBar` below is what actually stretches — `row` alone already
  // spans the parent's width by RN's default `alignItems: stretch`.
  rowBar: {
    gap: 6,
  },
  hit: {
    minWidth: MIN_TOUCH_TARGET - spacing.md,
    minHeight: MIN_TOUCH_TARGET - spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitBar: {
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  dotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dotIdle: {
    backgroundColor: colors.transparent,
    borderColor: colors.borderElevated,
  },
  bar: {
    width: '100%',
    height: 10,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  barFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  barIdle: {
    backgroundColor: colors.transparent,
    borderColor: colors.borderElevated,
  },
});
