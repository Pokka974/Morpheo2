import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, glow, MIN_TOUCH_TARGET, radius, sizes, spacing, typography } from '@theme/tokens';

interface Props {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Second line under the label — the design uses it to say what "on" means. */
  hint?: string;
  /**
   * Tints the track and the leading dot with amber instead of accent purple. Reserved
   * for the lucid-dream marker, which is one of the palette's only two amber uses.
   */
  highlight?: boolean;
  testID?: string;
}

/**
 * A labelled row switch on its own card surface. Not RN's `Switch`: that renders the
 * platform control, which carries iOS system green and ignores the palette entirely.
 */
export function Toggle({ label, value, onValueChange, hint, highlight = false, testID }: Props) {
  const on = highlight ? colors.highlight : colors.accent;

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      testID={testID}
      style={[
        styles.row,
        { borderColor: value ? on : colors.border },
        value && highlight && glow.highlight,
        value && !highlight && glow.soft,
      ]}
    >
      <View
        style={[styles.dot, { backgroundColor: value ? on : colors.borderElevated }]}
        // The dot repeats the switch state, so a screen reader would say it twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? on : colors.borderElevated }]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...typography.cardTitle,
    fontSize: 14,
  },
  hint: {
    ...typography.meta,
    fontSize: 12,
  },
  track: {
    width: sizes.toggleTrack,
    height: 26,
    borderRadius: radius.full,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    width: sizes.toggleKnob,
    height: sizes.toggleKnob,
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
  },
  knobOff: {
    left: 3,
  },
  knobOn: {
    left: sizes.toggleTrack - sizes.toggleKnob - 3,
  },
});
