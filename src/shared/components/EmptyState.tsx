import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  /**
   * Optional glyph. The design system uses drawn shapes rather than emoji, so the
   * default empty state renders a dashed ring; pass this only when a caller has a
   * specific mark in mind.
   */
  icon?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: Props) {
  return (
    <View style={styles.container}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : <View style={styles.ring} />}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCta ? <Button label={ctaLabel} onPress={onCta} style={styles.cta} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    padding: spacing.lg,
  },
  icon: {
    fontSize: 32,
  },
  ring: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderElevated,
  },
  title: {
    ...typography.cardTitle,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.meta,
    textAlign: 'center',
  },
  cta: {
    marginTop: spacing.xs,
  },
});
