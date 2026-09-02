import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { SkeletonCard } from '@shared/components/LoadingState';
import { Button } from '@shared/components/Button';
import { CloseIcon } from '@shared/components/icons';
import { Nox } from '@shared/components/Nox';
import {
  colors,
  emotionColors,
  gradients,
  radius,
  sizes,
  spacing,
  typography,
} from '@theme/tokens';

/**
 * The three stages the interpretation actually goes through, in order. They are a
 * narration of the real pipeline — the Edge Function reads the dream, extracts the
 * symbols, then crosses them with the user's recurrence patterns — not a decorative
 * progress bar, which is why they are timed against the request rather than a clock
 * that always reaches the end.
 */
export type WaitingStage = 'reading' | 'symbols' | 'crossing';

const STAGES: readonly WaitingStage[] = ['reading', 'symbols', 'crossing'];

/** How long each stage is shown before the narration advances, absent real telemetry. */
const STAGE_MS = 4200;

/**
 * The drifting stars behind the orb: the constellation from Insights, seen from very
 * close. Positions are fractions of the frame so they hold on any screen size.
 */
const STARS = [
  { x: 0.19, y: 0.14, size: 6, color: colors.accentText, duration: 3400, delay: 0 },
  { x: 0.76, y: 0.21, size: 5, color: emotionColors.freedom, duration: 4100, delay: 600 },
  { x: 0.11, y: 0.3, size: 4, color: colors.highlight, duration: 3800, delay: 1200 },
  { x: 0.54, y: 0.11, size: 4, color: emotionColors.calm, duration: 4600, delay: 300 },
  { x: 0.85, y: 0.37, size: 5, color: emotionColors.wonder, duration: 3200, delay: 900 },
  { x: 0.07, y: 0.59, size: 4, color: emotionColors.curiosity, duration: 4400, delay: 1600 },
] as const;

interface Props {
  /** The dream being read, shown so the wait is attached to something concrete. */
  dreamTitle?: string;
  /** How many dreams the reading is being cross-referenced against. */
  previousDreamCount?: number;
  /** Model id shown in the footer, alongside the expected duration. */
  modelLabel?: string;
  /** Leaves the interpretation running and returns to the journal. */
  onContinueInBackground?: () => void;
  /** Abandons the interpretation. */
  onCancel?: () => void;
}

/**
 * The wait after a dream is submitted for interpretation.
 *
 * A centred spinner says nothing about the work being done, so this screen names the
 * dream, shows the three real stages of the pipeline, and pre-draws the shape of the
 * answer with the skeleton card from the foundations — the layout does not jump when
 * the reading lands, because it was already there in outline.
 */
export function InterpretationWaitingView({
  dreamTitle,
  previousDreamCount,
  modelLabel,
  onContinueInBackground,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    // Stops at the last stage rather than looping: claiming to start over would be a
    // lie about a request that is still in flight.
    if (stageIndex >= STAGES.length - 1) return;
    const timer = setTimeout(() => setStageIndex(i => i + 1), STAGE_MS);
    return () => clearTimeout(timer);
  }, [stageIndex]);

  return (
    <LinearGradient
      colors={[...gradients.waiting.colors]}
      locations={[...gradients.waiting.locations]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.screen}
      accessibilityRole="progressbar"
      accessibilityLabel={t('dream.interpreting')}
    >
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {STARS.map((star, i) => (
          <Star key={i} {...star} />
        ))}
      </View>

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.dismiss}
          >
            <CloseIcon />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <Orb />

        <View style={styles.copy}>
          <Text style={styles.overline}>{t('dream.waitingOverline')}</Text>
          {dreamTitle ? (
            <Text style={styles.dreamTitle} numberOfLines={2}>
              {dreamTitle}
            </Text>
          ) : null}
          <Text style={styles.subtitle}>
            {previousDreamCount && previousDreamCount > 0
              ? t('dream.waitingSubtitleWithHistory', { count: previousDreamCount })
              : t('dream.waitingSubtitle')}
          </Text>
        </View>

        <View style={styles.stages}>
          {STAGES.map((stage, i) => (
            <Stage
              key={stage}
              stage={stage}
              state={i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'pending'}
            />
          ))}
        </View>

        <SweepingSkeleton />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.footerMeta}>
          {modelLabel ? t('dream.waitingModel', { model: modelLabel }) : t('dream.waitingDuration')}
        </Text>
        {onContinueInBackground ? (
          <Button
            label={t('dream.continueInBackground')}
            variant="ghost"
            onPress={onContinueInBackground}
            fullWidth
          />
        ) : null}
      </View>
    </LinearGradient>
  );
}

/** One pipeline stage: a ring that fills as the stage completes. */
function Stage({ stage, state }: { stage: WaitingStage; state: 'done' | 'active' | 'pending' }) {
  const { t } = useTranslation();
  const pulse = useBreath(state === 'active' ? 1800 : 0);

  return (
    <View style={styles.stageRow}>
      {state === 'active' ? (
        <Animated.View style={[styles.stageMark, styles.stageMarkActive, { opacity: pulse }]} />
      ) : (
        <View
          style={[styles.stageMark, state === 'done' ? styles.stageMarkDone : styles.stageMarkIdle]}
        />
      )}
      <Text
        style={[styles.stageLabel, state === 'active' && styles.stageLabelActive]}
        numberOfLines={2}
      >
        {t(`dream.waitingStage.${stage}`)}
      </Text>
    </View>
  );
}

/**
 * The centre of the wait: Nox drifting inside a breathing aura and its ring.
 *
 * This is the mascot's only in-app appearance, by design — she greets and she waits,
 * she never comments on a dream — and she stands exactly where the lit core disc used
 * to, so the orb's footprint is unchanged and the screen still fits a small phone.
 */
function Orb() {
  const halo = useBreath(3600, { from: 0.12, to: 0.34 });
  return (
    <View
      style={styles.orb}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.orbHalo, { opacity: halo }]}>
        <LinearGradient
          colors={[...gradients.orb.colors]}
          locations={[...gradients.orb.locations]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.orbHaloFill}
        />
      </Animated.View>
      <View style={styles.orbRing} />
      <Nox testID="interpretation-nox" />
    </View>
  );
}

/** The skeleton card with the light sweeping across it — the shape of the answer. */
function SweepingSkeleton() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  return (
    <View
      style={styles.skeletonWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SkeletonCard lines={3} />
      <Animated.View
        style={[
          styles.sweep,
          {
            opacity: sweep.interpolate({
              inputRange: [0, 0.15, 0.85, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateX: sweep.interpolate({
                  inputRange: [0, 1],
                  // Overshoots the widest phone by design: the sweep must leave the
                  // card entirely at each end rather than parking at its edge.
                  outputRange: [-SWEEP_WIDTH, SWEEP_TRAVEL],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

function Star({
  x,
  y,
  size,
  color,
  duration,
  delay,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
}) {
  const breath = useBreath(duration, { delay });
  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: size,
          height: size,
          backgroundColor: color,
          opacity: breath,
        },
      ]}
    />
  );
}

/**
 * The design's `mo-breathe`: opacity swelling and settling on a loop. A duration of 0
 * means "do not animate" — the stage marks reuse this hook and only one of them breathes.
 */
function useBreath(
  duration: number,
  { delay = 0, from = 0.35, to = 1 }: { delay?: number; from?: number; to?: number } = {}
): Animated.AnimatedInterpolation<number> | number {
  const value = useRef(new Animated.Value(0)).current;
  const active = duration > 0;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: duration / 2,
          delay,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, delay, active]);

  return active ? value.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) : to;
}

const SWEEP_WIDTH = 120;
const SWEEP_TRAVEL = 520;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  star: {
    position: 'absolute',
    borderRadius: radius.full,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: spacing.xl,
    paddingHorizontal: spacing.md + 2,
  },
  dismiss: {
    width: sizes.circleButton,
    height: sizes.circleButton,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderElevated,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingHorizontal: spacing.lg + 2,
  },
  orb: {
    width: sizes.orb,
    height: sizes.orb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbHalo: {
    // RN 0.86 dropped `absoluteFillObject`; `absoluteFill` is now the plain frozen
    // object it used to be the registered-ID twin of, so it spreads the same way.
    ...StyleSheet.absoluteFill,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  orbHaloFill: {
    flex: 1,
  },
  orbRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderMystic,
  },
  copy: {
    alignItems: 'center',
    gap: 10,
  },
  overline: {
    ...typography.overline,
    color: colors.highlight,
    textAlign: 'center',
  },
  dreamTitle: {
    ...typography.dreamTitle,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.meta,
    textAlign: 'center',
  },
  stages: {
    alignSelf: 'stretch',
    gap: 11,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  stageMark: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  stageMarkDone: {
    backgroundColor: colors.successSurface,
    borderColor: colors.success,
  },
  stageMarkActive: {
    backgroundColor: colors.accentText,
    borderColor: colors.accentText,
  },
  stageMarkIdle: {
    backgroundColor: colors.transparent,
    borderColor: colors.borderElevated,
  },
  stageLabel: {
    ...typography.meta,
    flex: 1,
    fontSize: 13.5,
  },
  stageLabelActive: {
    ...typography.cardTitle,
    fontSize: 13.5,
    lineHeight: 20,
  },
  skeletonWrap: {
    alignSelf: 'stretch',
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SWEEP_WIDTH,
    backgroundColor: colors.surfaceElevated,
  },
  footer: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg + 2,
  },
  footerMeta: {
    ...typography.counter,
    fontSize: 11,
    textAlign: 'center',
  },
});
