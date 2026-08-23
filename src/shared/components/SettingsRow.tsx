import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ChevronRightIcon } from '@shared/components/icons';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme/tokens';

/**
 * The settings screens are not part of the drawn design — the mockups cover Journal,
 * Insights and the dream detail flow only. This is a deliberate, minimal extension of
 * the existing vocabulary (same surface, radius, divider and type tokens as every
 * other card) rather than a new pattern: an iOS-style grouped list, one row per
 * setting, no chrome the rest of the app doesn't already use.
 */

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  // toArray drops falsy children (a conditionally-rendered row), so the last VISIBLE
  // row is the one that loses its divider — not just the last one in JSX order.
  const items = React.Children.toArray(children);
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.section}>
        {items.map((child, index) =>
          index === items.length - 1 && React.isValidElement<SettingsRowProps>(child)
            ? React.cloneElement(child, { style: [child.props.style, styles.lastRow] })
            : child
        )}
      </View>
    </View>
  );
}

interface SettingsRowProps {
  label: string;
  onPress?: () => void;
  value?: string;
  /** Renders the label and value in the error tone; reserved for account deletion. */
  destructive?: boolean;
  /** Hides the trailing chevron for a row that reports a value but doesn't navigate. */
  navigable?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function SettingsRow({
  label,
  onPress,
  value,
  destructive = false,
  navigable = true,
  accessibilityLabel,
  style,
}: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {navigable ? <ChevronRightIcon /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionWrap: {
    gap: spacing.sm,
  },
  sectionHeader: {
    ...typography.overline,
    paddingHorizontal: spacing.md,
  },
  section: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  pressed: {
    backgroundColor: colors.surfaceElevated,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    ...typography.body,
    flex: 1,
    color: colors.textSecondary,
  },
  rowLabelDestructive: {
    color: colors.error,
  },
  rowValue: {
    ...typography.meta,
    color: colors.textMuted,
  },
});
