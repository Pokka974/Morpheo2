import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, gradients, sizes } from '@theme/tokens';

/**
 * Nox — the Morpheo mascot, drawn rather than shipped as a bitmap, the same way every
 * other mark in this system is.
 *
 * The gibbous moon of the night: a full disc, a soft terminator on the right, one
 * closed eye and an amber cheek, with a detached star off her shoulder. She is not a
 * character — the design system rejected the cute direction outright ("Morpheo est
 * mystique, pas mignon"), which is why she has no face beyond the closed eye and no
 * limbs at all.
 *
 * Three declension rules from the design system, all of them load-bearing:
 *
 *  - The terminator is always on the *right*, overlaid at 16% and never subtracted
 *    from the disc, so the silhouette survives the monochrome reduction.
 *  - No outline, ever, and no drop shadow — this system lights things, it does not
 *    cast shadows from them.
 *  - **Never mirrored: Nox always looks to the left.** The idle sway below is a
 *    couple of degrees of rotation for exactly this reason; a horizontal flip would
 *    break her identity, so nothing here scales an axis negatively.
 *
 * The flat and silhouette variants are deliberately absent: they exist for the
 * favicon and the 24px notification icon, which are exported assets, not anything
 * this app renders at runtime.
 */

/** Nox is drawn on a 96-unit grid, as exported. */
const VIEW_BOX = 96;

/** Entrance: she rises into place rather than appearing. */
const ARRIVAL_MS = 760;
/** One full float cycle — up and back down. Slow enough to read as breathing. */
const FLOAT_MS = 4200;
/** How far she rises and sinks, in points. */
const FLOAT_TRAVEL = 6;
/** The sway that goes with the float, in degrees. Rotation only — never a flip. */
const SWAY_DEG = 1.4;

/** The terminator's opacity — the design system's hard ceiling is 18%. */
const TERMINATOR_OPACITY = 0.16;
/** The cheek is the dimmer of the two amber marks; the star stays at full strength. */
const CHEEK_OPACITY = 0.75;

interface MarkProps {
  /** Rendered width and height. Defaults to the wait-screen size. */
  size?: number;
}

/** Nox standing still — the artwork on its own, with no motion attached. */
export function NoxMark({ size = sizes.nox }: MarkProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}>
      <Defs>
        <LinearGradient id="noxDisc" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={gradients.nox.colors[0]} />
          <Stop offset="1" stopColor={gradients.nox.colors[1]} />
        </LinearGradient>
      </Defs>
      {/* The detached star, off her upper right. */}
      <Circle cx="82" cy="18" r="3" fill={colors.highlight} />
      <Circle cx="48" cy="48" r="36" fill="url(#noxDisc)" />
      {/* The terminator: overlaid on the disc, never cut out of it. */}
      <Path
        d="M64.5 16 A36 36 0 0 1 64.5 80 A48 48 0 0 0 64.5 16 Z"
        fill={colors.background}
        opacity={TERMINATOR_OPACITY}
      />
      {/* The closed eye — on the left, which is the side she always faces. */}
      <Path
        d="M18 44 q6 5.5 12 0"
        fill="none"
        stroke={colors.background}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <Circle cx="22" cy="58" r="3" fill={colors.highlight} opacity={CHEEK_OPACITY} />
    </Svg>
  );
}

interface Props extends MarkProps {
  /**
   * Set false to hold her still — the caller already knows motion is unwanted here.
   * Reduce-motion is honoured independently, so a caller never has to ask about it.
   */
  animated?: boolean;
  testID?: string;
}

/**
 * Nox, drifting.
 *
 * Two motions compose: a one-shot arrival (fade, rise and scale up from just below
 * her resting place) and an endless float — a slow vertical drift with a matching
 * sway, both on `Easing.inOut`, so there is no visible turn at either end of the
 * cycle. Everything runs on the native driver: the wait screen animates six stars, a
 * halo and a sweeping skeleton alongside this, and none of it may touch the JS thread
 * while an interpretation request is in flight.
 *
 * Decorative — the wait screen already announces itself as a progressbar and names
 * what is happening in its own copy, so she is hidden from assistive technology
 * rather than announced twice.
 */
export function Nox({ size = sizes.nox, animated = true, testID }: Props) {
  const arrival = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch((err: unknown) => {
        // A setting we cannot read is not a reason to lose the mascot; the animation
        // simply stays on, which is the platform default anyway.
        console.error('Failed to read the reduce-motion setting:', err);
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const moving = animated && !reduceMotion;

  useEffect(() => {
    // The arrival plays either way: a fade-in is not the kind of motion reduce-motion
    // is protecting against, and without it she pops onto the screen.
    const entrance = Animated.timing(arrival, {
      toValue: 1,
      duration: ARRIVAL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    entrance.start();
    return () => entrance.stop();
  }, [arrival]);

  useEffect(() => {
    if (!moving) {
      // Settle at mid-travel — the resting pose, not either extreme of the drift.
      float.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: FLOAT_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: FLOAT_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float, moving]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.nox,
        {
          width: size,
          height: size,
          opacity: arrival,
          transform: [
            {
              translateY: Animated.add(
                arrival.interpolate({ inputRange: [0, 1], outputRange: [FLOAT_TRAVEL * 2, 0] }),
                float.interpolate({
                  inputRange: [0, 1],
                  outputRange: [FLOAT_TRAVEL, -FLOAT_TRAVEL],
                })
              ),
            },
            {
              rotate: float.interpolate({
                inputRange: [0, 1],
                outputRange: [`-${SWAY_DEG}deg`, `${SWAY_DEG}deg`],
              }),
            },
            { scale: arrival.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) },
          ],
        },
      ]}
    >
      <NoxMark size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  nox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
