import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional heading above the message; defaults to the shared error title. */
  title?: string;
}

/**
 * The honest-failure card. The design gives errors their own red-tinted surface
 * rather than a modal, so a failed interpretation sits calmly in the flow next to
 * the dream that is still safely saved.
 */
export function ErrorState({ message, onRetry, retryLabel, title }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.title}>{title ?? t('states.errorTitle')}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button
          label={retryLabel ?? t('common.retry')}
          variant="secondary"
          onPress={onRetry}
          style={styles.retry}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md + 2,
    borderRadius: radius.card,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    gap: 6,
  },
  title: {
    ...typography.cardTitle,
    fontSize: 15,
    color: colors.error,
  },
  message: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  retry: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});
