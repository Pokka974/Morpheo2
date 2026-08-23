import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing } from '@theme/tokens';
interface VideoGenerationButtonProps {
  state: ReturnType<typeof import('./useVideoGeneration').useVideoGeneration>['state'];
  onSubmit: () => void;
  onUpgrade: () => void;
}

export function VideoGenerationButton({ state, onSubmit, onUpgrade }: VideoGenerationButtonProps) {
  if (state.status === 'idle') {
    return (
      <TouchableOpacity style={styles.button} onPress={onSubmit} accessibilityRole="button">
        <Text style={styles.buttonText}>Generate Dream Video</Text>
      </TouchableOpacity>
    );
  }

  if (state.status === 'submitting') {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.statusText}>Submitting...</Text>
      </View>
    );
  }

  if (state.status === 'processing') {
    return (
      <View style={styles.statusRow}>
        <ActivityIndicator color={colors.accent} size="small" />
        <Text style={styles.statusText}>
          Generating video (~{Math.ceil(state.job.estimatedDurationSeconds / 60)} min)...
        </Text>
      </View>
    );
  }

  if (state.status === 'complete') {
    return (
      <View style={styles.statusRow}>
        <Text style={styles.successText}>Video ready!</Text>
      </View>
    );
  }

  if (state.status === 'premium_required') {
    return (
      <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade} accessibilityRole="button">
        <Text style={styles.upgradeText}>Upgrade to Generate Video</Text>
      </TouchableOpacity>
    );
  }

  if (state.status === 'failed') {
    return (
      <View style={styles.statusRow}>
        <Text style={styles.errorText}>{state.message}</Text>
        <TouchableOpacity onPress={onSubmit} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  successText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    flex: 1,
  },
  retryText: {
    color: colors.accent,
    fontSize: 14,
  },
});
