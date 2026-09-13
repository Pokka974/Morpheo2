import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChevronUpIcon } from '@shared/components/icons';
import { colors, glow, radius, sizes, spacing } from '@theme/tokens';

const ANIMATION_MS = 200;

type Props = {
  visible: boolean;
  onPress: () => void;
  /** Distance from the screen's bottom edge — callers add safe-area/tab-bar clearance. */
  bottomOffset: number;
};

/** Floating affordance back to the top of a scrolled list, shown past a scroll threshold. */
export function ScrollToTopButton({ visible, onPress, bottomOffset }: Props) {
  const { t } = useTranslation();
  // Stays mounted throughout — the fade/scale is driven by this value rather than
  // an unmount, so appearing and disappearing are both animated instead of the
  // button just popping in and out at the threshold.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: ANIMATION_MS,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.button,
        glow.action,
        {
          bottom: bottomOffset,
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('common.scrollToTop')}
        style={styles.pressable}
      >
        <ChevronUpIcon color={colors.textOnAccent} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: spacing.md,
    width: sizes.circleButton,
    height: sizes.circleButton,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
