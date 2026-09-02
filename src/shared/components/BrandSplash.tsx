import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Nox } from '@shared/components/Nox';
import { colors, gradients, radius, sizes, spacing, typography } from '@theme/tokens';

/**
 * The launch screen, drawn.
 *
 * `expo-splash-screen` is a centred-logo API: it scales one image to `imageWidth`
 * points on a flat background, and Android 12+ masks that image to a circle. A
 * composed screen handed to it is squashed into a small square and its lettering is
 * clipped, so the native splash carries Nox alone (`splash-icon.svg`) and everything
 * around her — the halo, the stars, the wordmark — is rendered here instead, from
 * `brand/splash-screen.svg`, in the design system's own tokens rather than a bitmap.
 *
 * The two are aligned deliberately: Nox sits at `sizes.noxSplash`, the footprint the
 * native icon already occupies, on the same `colors.background` ground. The native
 * splash cross-fades into this one (`fade: true` in the root layout), so she does not
 * move or resize across the handover — only the wordmark arrives.
 *
 * Timing has two halves, and both matter:
 *
 *  - `MIN_VISIBLE_MS` is a floor, not a delay. Without it the screen flashes on a warm
 *    start, which reads as a glitch rather than a launch.
 *  - `ready` is the ceiling. The screen stays until the app behind it knows where it is
 *    going, so nothing appears before the first route is resolved.
 *
 * A hard three-second hold was considered and rejected: past ~1.5s a launch reads as a
 * slow app rather than a brand, and Apple's HIG treats the launch screen as continuity,
 * not a title card. Raising the floor is a one-line change if that call ever flips.
 */

/** The shortest the launch screen is allowed to be seen, from first paint. */
const MIN_VISIBLE_MS = 1500;
/** The fade out, matched to the native splash's own cross-fade. */
export const SPLASH_FADE_MS = 300;

/**
 * The stars from the launch composition, as fractions of the frame so they hold on
 * any screen. Positions and opacities are the design's, not new values.
 */
const STARS = [
  { x: 0.18, y: 0.19, size: 5, opacity: 0.5 },
  { x: 0.79, y: 0.24, size: 6, opacity: 0.42 },
  { x: 0.27, y: 0.71, size: 5, opacity: 0.34 },
  { x: 0.73, y: 0.76, size: 4, opacity: 0.46 },
  { x: 0.5, y: 0.13, size: 4, opacity: 0.3 },
] as const;

interface Props {
  /** The app behind has resolved its first route and can be revealed. */
  ready: boolean;
  /** Called once the fade out has finished and the screen can be unmounted. */
  onFinish: () => void;
}

export function BrandSplash({ ready, onFinish }: Props) {
  const { t } = useTranslation();
  const opacity = useRef(new Animated.Value(1)).current;
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;

    // Measured from first paint rather than mount: the native splash is still up until
    // then, and counting from mount would spend the floor behind it.
    const elapsed = shownAt.current === null ? 0 : Date.now() - shownAt.current;
    const exit = Animated.sequence([
      Animated.delay(Math.max(0, MIN_VISIBLE_MS - elapsed)),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SPLASH_FADE_MS,
        useNativeDriver: true,
      }),
    ]);
    exit.start(({ finished }) => {
      if (finished) onFinish();
    });
    return () => exit.stop();
  }, [ready, opacity, onFinish]);

  /**
   * The native splash is dismissed here rather than on mount, so it is only ever
   * replaced by a screen that has actually been laid out. Hiding it a frame early
   * shows the bare app background between the two.
   */
  function handleLayout() {
    if (shownAt.current !== null) return;
    shownAt.current = Date.now();
    SplashScreen.hideAsync().catch((err: unknown) => {
      // Already hidden, or no native splash at all (Expo Go, a reload). The screen
      // below is the real one either way, so there is nothing to recover.
      console.error('Hiding the native splash screen failed:', err);
    });
  }

  return (
    <Animated.View
      style={[styles.screen, { opacity }]}
      onLayout={handleLayout}
      accessibilityRole="progressbar"
      accessibilityLabel={t('splash.a11yLabel')}
      testID="brand-splash"
    >
      <LinearGradient
        colors={[...gradients.waiting.colors]}
        locations={[...gradients.waiting.locations]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {STARS.map((star, i) => (
          <View
            key={i}
            style={[
              styles.star,
              {
                left: `${star.x * 100}%`,
                top: `${star.y * 100}%`,
                width: star.size,
                height: star.size,
                opacity: star.opacity,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.mark}>
        <Halo />
        <Nox size={sizes.noxSplash} testID="splash-nox" />
      </View>

      <View style={styles.wordmark}>
        <Text style={styles.title}>{t('common.appName')}</Text>
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * The glow Nox sits in. Elevation in this system is light, never shadow — and light
 * has no edge, so this is a radial falloff to fully transparent rather than a flat
 * disc, which would read as a hard-edged circle behind her.
 */
function Halo() {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="splashHalo" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={HALO_OPACITY} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill="url(#splashHalo)" />
    </Svg>
  );
}

/** The halo at its centre. The design's own value for the launch screen's glow. */
const HALO_OPACITY = 0.5;

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    backgroundColor: colors.background,
  },
  star: {
    position: 'absolute',
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
  },
  mark: {
    width: sizes.splashHalo,
    height: sizes.splashHalo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.dreamTitle,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  tagline: {
    ...typography.overline,
    fontSize: 12,
    letterSpacing: 3,
    textAlign: 'center',
  },
});
