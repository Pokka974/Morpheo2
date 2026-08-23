import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, emotionChip, radius, spacing, typography } from '@theme/tokens';

export type ChipVariant = 'emotion' | 'keyword';

interface ChipProps {
  label: string;
  /**
   * `emotion` tints the chip with the feeling's own hue (ten defined in the tokens,
   * unknown values fall back to amethyst). `keyword` is the neutral chip used for
   * symbols and cultural references, so a screen full of them stays calm.
   */
  variant?: ChipVariant;
  style?: ViewStyle;
}

/**
 * The recurring pill used for emotions, symbolic keywords and cultural references.
 *
 * Colour never carries meaning on its own here — the label is always present, which
 * is what keeps the emotion palette accessible to colour-blind readers.
 */
export function Chip({ label, variant = 'emotion', style }: ChipProps) {
  const { t } = useTranslation();

  const palette =
    variant === 'emotion'
      ? emotionChip(label)
      : {
          text: colors.textSecondary,
          fill: colors.chipNeutralFill,
          border: colors.chipNeutralBorder,
        };

  return (
    <View
      style={[styles.chip, { backgroundColor: palette.fill, borderColor: palette.border }, style]}
      accessibilityRole="text"
      accessibilityLabel={t(variant === 'emotion' ? 'a11y.emotionChip' : 'a11y.keywordChip', {
        label,
      })}
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
