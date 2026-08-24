import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface DreamImageActionBarProps {
  media: MediaResult | null;
  isGenerating: boolean;
  /**
   * The reason the last generation attempt failed (safety block, limit reached,
   * provider error, etc.), derived by the caller from `useImageGeneration()`'s
   * state. Takes priority over `media?.errorMessage` since a failed attempt often
   * has no `media` row at all.
   */
  errorMessage?: string | null;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  canRegenerate: boolean;
}

/**
 * Status text + generate/regenerate control for the dream image. The image
 * itself lives in the detail screen's hero — this bar never renders one.
 */
export function DreamImageActionBar({
  media,
  isGenerating,
  errorMessage,
  onGenerate,
  onRegenerate,
  canRegenerate,
}: DreamImageActionBarProps) {
  const { t } = useTranslation();

  if (isGenerating) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.hint}>{t('dream.imageIllustrating')}</Text>
      </View>
    );
  }

  if (!media || media.generationStatus === 'failed') {
    const failureMessage = errorMessage ?? media?.errorMessage ?? null;
    return (
      <View style={styles.row}>
        <Text style={styles.hint}>{failureMessage ?? t('dream.imageNoneYet')}</Text>
        {onGenerate && (
          <Pressable onPress={onGenerate} accessibilityRole="button" style={styles.actionButton}>
            <Text style={styles.actionText}>
              {failureMessage ? t('dream.imageRetry') : t('dream.imageGenerateButton')}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (canRegenerate && onRegenerate && media.regenerationCount < media.maxRegenerations) {
    return (
      <Pressable
        onPress={onRegenerate}
        accessibilityRole="button"
        style={[styles.actionButton, styles.actionButtonAlone]}
      >
        <Text style={styles.actionText}>
          {t('dream.imageRegenerate', {
            count: media.maxRegenerations - media.regenerationCount,
          })}
        </Text>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hint: {
    ...typography.meta,
    color: colors.textMuted,
    flexShrink: 1,
  },
  actionButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonAlone: {
    alignSelf: 'flex-start',
  },
  actionText: {
    ...typography.meta,
    color: colors.accentText,
  },
});
