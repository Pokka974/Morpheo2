import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, emotionChip, radius, spacing, typography } from '@theme/tokens';

export type ChipVariant = 'emotion' | 'keyword' | 'entry';

interface ChipProps {
  label: string;
  /**
   * `emotion` tints the chip with the feeling's own hue (ten defined in the tokens,
   * unknown values fall back to amethyst). `keyword` is the neutral chip used for
   * symbols and cultural references, so a screen full of them stays calm. `entry` is
   * what the dreamer typed themselves — characters, places — and reads solid and
   * bright against the reading's dimmer, dashed vocabulary. Two vocabularies, two
   * styles: the rule holds across the log screen, the detail and Lectures.
   */
  variant?: ChipVariant;
  style?: ViewStyle;
}

const CHIP_PALETTES = {
  keyword: {
    text: colors.textSecondary,
    fill: colors.chipNeutralFill,
    border: colors.chipNeutralBorder,
  },
  entry: {
    text: colors.textPrimary,
    fill: colors.surfaceElevated,
    border: colors.borderElevated,
  },
} as const;

const A11Y_KEYS: Record<ChipVariant, string> = {
  emotion: 'a11y.emotionChip',
  keyword: 'a11y.keywordChip',
  entry: 'a11y.entryChip',
};

/**
 * The recurring pill used for emotions, symbolic keywords and cultural references.
 *
 * Colour never carries meaning on its own here — the label is always present, which
 * is what keeps the emotion palette accessible to colour-blind readers.
 */
export function Chip({ label, variant = 'emotion', style }: ChipProps) {
  const { t } = useTranslation();

  const palette = variant === 'emotion' ? emotionChip(label) : CHIP_PALETTES[variant];

  return (
    <View
      style={[styles.chip, { backgroundColor: palette.fill, borderColor: palette.border }, style]}
      accessibilityRole="text"
      accessibilityLabel={t(A11Y_KEYS[variant], { label })}
    >
      <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.chip,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    ...typography.chip,
  },
});

/** Lays out a run of chips with the design's 7px gap and consistent wrapping. */
export function ChipRow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles2.row, style]}>{children}</View>;
}

const styles2 = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: spacing.xs / 2,
  },
});
