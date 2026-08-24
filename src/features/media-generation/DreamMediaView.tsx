import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';
import { colors, spacing } from '@theme/tokens';

interface DreamMediaViewProps {
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

export function DreamMediaView({
  media,
  isGenerating,
  errorMessage,
  onGenerate,
  onRegenerate,
  canRegenerate,
}: DreamMediaViewProps) {
  const { t } = useTranslation();

  if (isGenerating) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.hint}>{t('dream.imageIllustrating')}</Text>
      </View>
    );
  }

  if (!media || media.generationStatus === 'failed') {
    const failureMessage = errorMessage ?? media?.errorMessage ?? null;
    return (
      <View style={styles.placeholder}>
        <Text style={styles.hint}>{failureMessage ?? t('dream.imageNoneYet')}</Text>
        {onGenerate && (
          <TouchableOpacity
            style={styles.regenButton}
            onPress={onGenerate}
            accessibilityRole="button"
          >
            <Text style={styles.regenText}>
              {failureMessage ? t('dream.imageRetry') : t('dream.imageGenerateButton')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const imageUri = media.localCachePath ?? media.signedUrl;

  return (
    <View style={styles.container}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel="Dream illustration"
        />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      )}

      {canRegenerate && onRegenerate && media.regenerationCount < media.maxRegenerations && (
        <TouchableOpacity
          style={styles.regenButton}
          onPress={onRegenerate}
          accessibilityRole="button"
        >
          <Text style={styles.regenText}>
            {t('dream.imageRegenerate', {
              count: media.maxRegenerations - media.regenerationCount,
            })}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  placeholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  regenButton: {
    padding: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  regenText: {
    color: colors.accent,
    fontSize: 14,
  },
});
