import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  message?: string;
}

export function LoadingState({ message }: Props) {
  return (
    <View style={styles.container} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.accent} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

/**
 * The skeleton card from the design — three staggered bars on a card surface.
 * Preferred over a spinner wherever the shape of the incoming content is known,
 * because it keeps the layout from jumping when the data lands.
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const widths = ['60%', '90%', '75%', '85%'];
  return (
    <View style={styles.skeleton} accessibilityRole="progressbar">
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={[styles.skeletonBar, { width: widths[i % widths.length] as `${number}%` }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  message: {
    ...typography.meta,
  },
  skeleton: {
    padding: spacing.lg - 4,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  skeletonBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
});
