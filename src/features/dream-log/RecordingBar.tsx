import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, glow, MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme/tokens';

/** Twelve bars, as drawn. Heights are a fixed pattern, animated as a travelling wave. */
const BAR_HEIGHTS = [0.4, 0.75, 0.55, 1, 0.65, 0.35, 0.8, 0.5, 0.7, 0.3, 0.6, 0.45];
const WAVEFORM_HEIGHT = 28;
const CYCLE_MS = 900;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  elapsedSeconds: number;
  onStop: () => void;
}

/**
 * The voice-dictation state of the log screen: a stop button, a live waveform and the
 * elapsed timer. The red disc is the only red on this screen — the design reserves the
 * colour for the act of recording, never for the lucid marker or a CTA.
 */
export function RecordingBar({ elapsedSeconds, onStop }: Props) {
  const { t } = useTranslation();
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(wave, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [wave]);

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onStop}
        accessibilityRole="button"
        accessibilityLabel={t('log.micStop')}
        hitSlop={spacing.xs}
        style={styles.stopButton}
      >
        <View style={styles.stopSquare} />
      </Pressable>

      <View
        style={styles.waveform}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {BAR_HEIGHTS.map((height, i) => (
          <Animated.View
            key={i}
            style={[
              styles.waveBar,
              {
                height: WAVEFORM_HEIGHT * height,
                // Each bar peaks a little after the one before it, so the row reads as
                // a wave travelling left to right rather than twelve bars pulsing as one.
                opacity: wave.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: phaseFor(i),
                }),
              },
            ]}
          />
        ))}
      </View>

      <Text
        style={styles.elapsed}
        accessibilityLabel={t('log.recordingElapsed', { time: formatElapsed(elapsedSeconds) })}
      >
        {formatElapsed(elapsedSeconds)}
      </Text>
    </View>
  );
}

/** Rotates the opacity ramp by the bar's index so the crest moves along the row. */
function phaseFor(index: number): [number, number, number] {
  const ramp: [number, number, number] = [0.45, 1, 0.45];
  const shift = index % 3;
  return [ramp[shift % 3]!, ramp[(shift + 1) % 3]!, ramp[shift % 3]!];
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 6,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMystic,
  },
  stopButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    ...glow.soft,
    shadowColor: colors.error,
  },
  stopSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.textOnAccent,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: WAVEFORM_HEIGHT,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: colors.accentText,
  },
  elapsed: {
    ...typography.counter,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
