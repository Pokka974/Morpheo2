import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  /**
   * Optional glyph. Pass a drawn icon (see icons.tsx) — the system forbids emoji and
   * dingbats. With nothing passed, the default empty state renders a dashed ring.
   */
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: Props) {
  return (
    <View style={styles.container}>
      {icon ?? <View style={styles.ring} />}
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
