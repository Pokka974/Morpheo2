import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, glow, gradients, radius, spacing } from '@theme/tokens';

export type CardVariant = 'surface' | 'mystic';

interface Props extends ViewProps {
  children: React.ReactNode;
  /**
   * `surface` is the default flat card. `mystic` is the gradient-and-glow card the
   * design reserves for AI output and insights — used sparingly, it is what marks
   * a surface as "the app thought about this".
   */
  variant?: CardVariant;
}

export function Card({ children, style, variant = 'surface', ...rest }: Props) {
  if (variant === 'mystic') {
    return (
      <LinearGradient
        colors={[...gradients.mystic.colors]}
        locations={[...gradients.mystic.locations]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, styles.mystic, style]}
        {...rest}
      >
        {children}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.card, styles.surface, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
  },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  mystic: {
    borderColor: colors.borderMystic,
    ...glow.soft,
  },
});
