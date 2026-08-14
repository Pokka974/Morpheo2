import React from 'react';
import { StyleSheet, Text, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { spacing } from '../tokens/spacing';
import { fontSize } from '../tokens/typography';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends Omit<TouchableOpacityProps, 'style'> {
  label: string;
  variant?: Variant;
}

export function Button({ label, variant = 'primary', disabled, ...rest }: Props) {
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], disabled && styles.disabled]}
      disabled={disabled}
      accessibilityRole="button"
      {...rest}
    >
      <Text style={[styles.labelBase, styles[`${variant}Label`]]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#7c5cbf',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#7c5cbf',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  labelBase: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  primaryLabel: {
    color: '#ffffff',
  },
  secondaryLabel: {
    color: '#7c5cbf',
  },
  ghostLabel: {
    color: '#7c5cbf',
  },
});
