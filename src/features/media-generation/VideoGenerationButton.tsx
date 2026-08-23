import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/components/Button';
import { colors, spacing, typography } from '@theme/tokens';

interface VideoGenerationButtonProps {
  state: ReturnType<typeof import('./useVideoGeneration').useVideoGeneration>['state'];
  onSubmit: () => void;
  onUpgrade: () => void;
}

/**
 * The video-generation control on the dream detail screen. One component covers all
 * six states the job can be in, each rendered through the shared Button and token
 * type scale rather than one-off styles.
 */
export function VideoGenerationButton({ state, onSubmit, onUpgrade }: VideoGenerationButtonProps) {
  const { t } = useTranslation();

  if (state.status === 'idle') {
    return <Button label={t('video.generate')} onPress={onSubmit} fullWidth />;
  }

  if (state.status === 'submitting') {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.statusText}>{t('video.submitting')}</Text>
      </View>
    );
  }

  if (state.status === 'processing') {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.statusText}>
          {t('video.processingEstimate', {
            minutes: Math.ceil(state.job.estimatedDurationSeconds / 60),
          })}
        </Text>
      </View>
    );
  }

  if (state.status === 'complete') {
    return (
      <View style={styles.statusRow}>
        <Text style={styles.successText}>{t('video.ready')}</Text>
      </View>
    );
  }

  if (state.status === 'premium_required') {
    return <Button label={t('video.upgradeCta')} variant="secondary" onPress={onUpgrade} fullWidth />;
  }

  if (state.status === 'failed') {
    return (
      <View style={styles.failedRow}>
        <Text style={styles.errorText}>{state.message}</Text>
        <Button label={t('common.retry')} variant="ghost" onPress={onSubmit} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusText: {
    ...typography.meta,
    fontSize: 14,
    color: colors.textSecondary,
  },
  successText: {
    ...typography.chip,
    fontSize: 14,
    color: colors.success,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.meta,
    fontSize: 14,
    color: colors.error,
    flex: 1,
  },
});
