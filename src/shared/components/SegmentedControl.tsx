import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme/tokens';

/**
 * The pill-track switch the design uses twice: as the Insights period selector, and —
 * unchanged, deliberately — as the Write / Dictate mode switch on the dream-log screen.
 * It is one control, so it lives here rather than being drawn twice.
 */

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Spoken instead of `label`, which is usually too terse on its own ("30 j"). */
  accessibilityLabel?: string;
}

interface Props<T extends string> {
  segments: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Stretches every segment to an equal share of the width. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  fullWidth = false,
  style,
  testID,
}: Props<T>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" testID={testID}>
      {segments.map(segment => {
        const active = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.accessibilityLabel ?? segment.label}
            style={[styles.segment, fullWidth && styles.segmentWide, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 6,
    padding: spacing.xs,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentWide: {
    flex: 1,
    // Only the full-width variant carries the tap target on its own: the compact
    // Insights variant sits inside a header row that is already tall enough.
    minHeight: MIN_TOUCH_TARGET - spacing.sm,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  label: {
    ...typography.chip,
  },
  labelActive: {
    color: colors.textOnAccent,
  },
  labelIdle: {
    color: colors.textMuted,
  },
});
