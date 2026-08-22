import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

interface DreamMediaViewProps {
  media: MediaResult | null;
  isGenerating: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  canRegenerate: boolean;
}

export function DreamMediaView({
  media,
  isGenerating,
  onGenerate,
  onRegenerate,
  canRegenerate,
}: DreamMediaViewProps) {
  if (isGenerating) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.hint}>Illustrating your dream...</Text>
      </View>
    );
  }

  if (!media || media.generationStatus === 'failed') {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.hint}>{media?.errorMessage ?? 'No illustration yet'}</Text>
        {onGenerate && (
          <TouchableOpacity
            style={styles.regenButton}
            onPress={onGenerate}
            accessibilityRole="button"
          >
            <Text style={styles.regenText}>{media?.errorMessage ? 'Retry' : 'Generate Image'}</Text>
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
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      )}

      {canRegenerate && onRegenerate && media.regenerationCount < media.maxRegenerations && (
        <TouchableOpacity
          style={styles.regenButton}
          onPress={onRegenerate}
          accessibilityRole="button"
        >
          <Text style={styles.regenText}>
            Regenerate ({media.maxRegenerations - media.regenerationCount} left)
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
    backgroundColor: '#1a1a2e',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  placeholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
  },
  hint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  regenButton: {
    padding: spacing.sm,
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  regenText: {
    color: colors.primary,
    fontSize: 14,
  },
});
