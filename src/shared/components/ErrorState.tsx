import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional heading above the message; defaults to the shared error title. */
  title?: string;
  /**
   * Renders the card centred on its own screen instead of inline.
   *
   * Without this the card is a block with no height of its own, so a screen whose
   * entire body is an error draws it flush against the top of the display — under the
   * notch and the status bar. Inline uses (a failed sign-in above the form) must stay
   * unpadded, hence a variant rather than baking insets into the card.
   */
  fullScreen?: boolean;
}

/**
 * The honest-failure card. The design gives errors their own red-tinted surface
 * rather than a modal, so a failed interpretation sits calmly in the flow next to
 * the dream that is still safely saved.
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel,
  title,
  fullScreen = false,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const card = (
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

  if (!fullScreen) return card;

  return (
    <View
      testID="error-screen"
      style={[
        styles.screen,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.md,
        },
      ]}
    >
      {card}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
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
