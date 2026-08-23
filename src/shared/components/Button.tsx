import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  colors,
  glow,
  gradients,
  MIN_TOUCH_TARGET,
  radius,
  sizes,
  spacing,
  typography,
} from '@theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Stretches the button to fill its parent's cross axis. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle;
}

/**
 * The three button levels from the design: a filled primary that glows, an outlined
 * secondary, and a bare ghost. Disabled renders at 40% and stops responding.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  testID,
  style,
}: ButtonProps) {
  const inert = disabled || loading;

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'primary' && !inert && glow.soft,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        fullWidth && styles.fullWidth,
        inert && styles.inert,
        pressed && !inert && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textOnAccent : colors.accentText}
        />
      ) : (
        <Text
          style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelAccent]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The centre action of the tab bar — a 58px gradient disc that lifts above the bar
 * so it stays inside thumb reach.
 */
export function ActionButton({
  onPress,
  accessibilityLabel,
  testID,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [styles.fabHit, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[...gradients.fab.colors]}
        locations={[...gradients.fab.locations]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.fab, glow.action]}
      >
        <View style={styles.plusVertical} />
        <View style={styles.plusHorizontal} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.transparent,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  ghost: {
    backgroundColor: colors.transparent,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inert: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  label: {
    ...typography.button,
  },
  labelPrimary: {
    color: colors.textOnAccent,
  },
  labelAccent: {
    color: colors.accentText,
  },

  fabHit: {
    width: sizes.fab,
    height: sizes.fab,
    marginTop: -sizes.fabLift,
  },
  fab: {
    width: sizes.fab,
    height: sizes.fab,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusVertical: {
    position: 'absolute',
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: colors.textOnAccent,
  },
  plusHorizontal: {
    position: 'absolute',
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textOnAccent,
  },
});

export const BUTTON_MIN_HEIGHT = MIN_TOUCH_TARGET;
export const BUTTON_GAP = spacing.sm;
