import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { LoadingState } from '@shared/components/LoadingState';
import { Button } from '@shared/components/Button';
import { Chip, ChipRow } from '@shared/components/Chip';
import { SegmentedControl } from '@shared/components/SegmentedControl';
import {
  ConstellationChart,
  type ConstellationNode,
} from '@features/recurrence/ConstellationChart';
import { EmotionRibbon, type RibbonPoint } from '@features/recurrence/EmotionRibbon';
import {
  getTopRecurrences,
  type RecurrencePattern,
} from '@features/recurrence/recurrenceRepository';
import { getRecurrenceChains, type RecurrenceChain } from '@features/recurrence/recurrenceChains';
import {
  getSleepClarityPoints,
  type SleepClarityPoint,
} from '@features/recurrence/sleepClarityRepository';
import {
  SleepClarityScatter,
  type ScatterBubble,
  type ScatterTrend,
} from '@features/recurrence/SleepClarityScatter';
import { useServices } from '@services/useServices';
import { supabase } from '../../../supabase/client';
import {
  colors,
  constellationBackground,
  gradients,
  radius,
  spacing,
  typography,
} from '@theme/tokens';

type Period = '30' | '90' | 'all';

const PERIOD_DAYS: Record<Period, number | null> = { '30': 30, '90': 90, all: null };
const PERIODS = ['30', '90', 'all'] as const;
/** Short labels for the segmented control; `periodLabel*` are the long forms in prose. */
const PERIOD_KEYS: Record<Period, string> = {
  '30': 'insights.period30',
  '90': 'insights.period90',
  all: 'insights.periodAll',
};

/** Free tier sees the top 3 over 30 days (FR-018); premium sees everything. */
const FREE_LIMIT = 3;
const FREE_WINDOW_DAYS = 30;
const PREMIUM_LIMIT = 12;

export default function InsightsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { entitlement } = useServices();

  const [isPremium, setIsPremium] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [keywords, setKeywords] = useState<RecurrencePattern[]>([]);
  const [emotions, setEmotions] = useState<RecurrencePattern[]>([]);
  const [sleepClarityPoints, setSleepClarityPoints] = useState<SleepClarityPoint[]>([]);
  const [chains, setChains] = useState<RecurrenceChain[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);
        setIsPremium(await entitlement.isPremium());
      } catch (err) {
        console.error('Failed to resolve insights entitlement:', err);
      } finally {
        setIsLoading(false);
      }
    }
    void init();
  }, [entitlement]);

  const load = useCallback(async () => {
    if (!userId) return;
    const limit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
    // `undefined` means "all time"; the repository omits the date filter for it.
    const days = (isPremium ? PERIOD_DAYS[period] : FREE_WINDOW_DAYS) ?? undefined;
    try {
      const [kw, em, points, recurrenceChains] = await Promise.all([
        getTopRecurrences(userId, 'keyword', limit, days),
        getTopRecurrences(userId, 'emotion', limit, days),
        getSleepClarityPoints(userId, days),
        getRecurrenceChains(userId),
      ]);
      setKeywords(kw);
      setEmotions(em);
      setSleepClarityPoints(points);
      setChains(recurrenceChains);
    } catch (err) {
      console.error('Failed to load recurrence patterns:', err);
    }
  }, [userId, isPremium, period]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Each keyword becomes a star, tinted by the emotion it most often shares a dream
   * with — that pairing is the whole reason the constellation beats a bar chart.
   */
  const nodes: ConstellationNode[] = useMemo(
    () =>
      keywords.map(kw => ({
        id: kw.id,
        term: kw.term,
        count: kw.occurrenceCount,
        emotion: dominantEmotion(kw, emotions),
        dreamIds: kw.dreamIds,
      })),
    [keywords, emotions]
  );

  const ribbon: RibbonPoint[] = useMemo(() => buildRibbon(emotions), [emotions]);
  const scatter = useMemo(() => buildScatterData(sleepClarityPoints), [sleepClarityPoints]);

  const periodLabel = t(
    period === '30'
      ? 'insights.periodLabel30'
      : period === '90'
        ? 'insights.periodLabel90'
        : 'insights.periodLabelAll'
  );

  if (isLoading) return <LoadingState message={t('insights.loading')} />;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerMeta}>
            {t('insights.subtitle', { count: keywords.length, since: periodLabel })}
          </Text>
          <Text style={styles.headerTitle}>{t('insights.title')}</Text>
        </View>

        {isPremium ? (
          <SegmentedControl
            segments={PERIODS.map(value => ({
              value,
              label: t(PERIOD_KEYS[value]),
              accessibilityLabel: t('a11y.selectPeriod', { period: t(PERIOD_KEYS[value]) }),
            }))}
            value={period}
            onChange={setPeriod}
          />
        ) : null}
      </View>

      <LinearGradient
        colors={[...constellationBackground.colors]}
        locations={[...constellationBackground.locations]}
        start={{ x: 0.25, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.panel}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>{t('insights.constellationTitle')}</Text>
          <Text style={styles.panelMeta}>{periodLabel}</Text>
        </View>
        <Text style={styles.panelLegend}>{t('insights.constellationLegend')}</Text>
        <ConstellationChart nodes={nodes} testID="constellation" />
      </LinearGradient>

      {ribbon.length >= 2 ? (
        <View style={styles.surfacePanel}>
          <Text style={styles.panelTitle}>{t('insights.ribbonTitle')}</Text>
          <Text style={styles.panelLegend}>
            {t('insights.ribbonSubtitle', { period: periodLabel })}
          </Text>
          <EmotionRibbon points={ribbon} testID="emotion-ribbon" />
        </View>
      ) : null}

      {emotions.length > 0 ? (
        <View style={styles.surfacePanel}>
          <Text style={styles.panelTitle}>{t('insights.topEmotions')}</Text>
          <ChipRow>
            {emotions.map(e => (
              <Chip key={e.id} label={e.term} />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <View style={styles.surfacePanel}>
        <Text style={styles.panelTitle}>{t('insights.sleepClarityTitle')}</Text>
        {scatter.bubbles.length > 0 ? (
          <>
            <Text style={styles.panelLegend}>
              {t('insights.sleepClaritySubtitle', { period: periodLabel })}
            </Text>
            <SleepClarityScatter
              bubbles={scatter.bubbles}
              trend={scatter.trend}
              testID="sleep-clarity-scatter"
            />
            {scatter.captionQuality != null ? (
              <Text style={styles.panelCaption}>
                {t('insights.sleepClarityCaption', { quality: scatter.captionQuality })}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.panelTitleSecondary}>{t('insights.sleepClarityEmptyTitle')}</Text>
            <Text style={styles.panelLegend}>{t('insights.sleepClarityEmptyBody')}</Text>
          </>
        )}
      </View>

      {chains.length > 0 ? (
        <View style={styles.surfacePanel}>
          <Text style={styles.panelTitle}>{t('insights.chainsTitle')}</Text>
          <Text style={styles.panelLegend}>{t('insights.chainsSubtitle')}</Text>
          <View style={styles.chainList}>
            {chains.map(chain => (
              <View key={chain.id} style={styles.chainCard}>
                <Text style={styles.panelMeta}>
                  {t('insights.chainLength', { count: chain.dreams.length })}
                </Text>
                {chain.dreams.map(dream => (
                  <Pressable
                    key={dream.id}
                    onPress={() => router.push(`/(main)/journal/${dream.id}/detail`)}
                    accessibilityRole="button"
                    accessibilityLabel={dream.title}
                    style={styles.chainRow}
                  >
                    <Text style={styles.chainRowDate}>
                      {new Date(dream.occurredAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                    <Text style={styles.chainRowTitle} numberOfLines={1}>
                      {dream.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!isPremium ? (
        <LinearGradient
          colors={[...gradients.mystic.colors]}
          locations={[...gradients.mystic.locations]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.upgradeCard}
        >
          <View style={styles.premiumRow}>
            <View style={styles.premiumDot} />
            <Text style={styles.premiumLabel}>{t('common.premium')}</Text>
          </View>
          <Text style={styles.upgradeTitle}>{t('insights.upgradeTitle')}</Text>
          <Text style={styles.upgradeBody}>{t('insights.upgradeBody')}</Text>
          <Button
            label={t('insights.upgradeCta')}
            onPress={() => router.push('/(main)/paywall')}
            style={styles.upgradeCta}
          />
        </LinearGradient>
      ) : null}
    </ScrollView>
  );
}

/** The emotion sharing the most dreams with this keyword. */
function dominantEmotion(
  keyword: RecurrencePattern,
  emotions: RecurrencePattern[]
): string | undefined {
  let best: { term: string; shared: number } | undefined;
  for (const emotion of emotions) {
    const shared = emotion.dreamIds.filter(id => keyword.dreamIds.includes(id)).length;
    if (shared > 0 && (!best || shared > best.shared)) {
      best = { term: emotion.term, shared };
    }
  }
  return best?.term;
}

/**
 * Derives the night's arc from the recurring emotions.
 *
 * Until per-dream timestamps carry an emotional reading, this distributes the known
 * emotions across the night and separates them into the positive curve and the
 * dashed tension line. The shape is honest about what it is: an average, labelled as
 * such in the subtitle.
 */
const POSITIVE = new Set(['calm', 'joy', 'freedom', 'curiosity', 'wonder', 'nostalgia']);
const CLOCK = ['23h', '01h', '03h', '05h', '07h'];

export function buildRibbon(emotions: RecurrencePattern[]): RibbonPoint[] {
  if (emotions.length === 0) return [];

  const total = emotions.reduce((sum, e) => sum + e.occurrenceCount, 0) || 1;
  const positiveShare =
    emotions
      .filter(e => POSITIVE.has(e.term.trim().toLowerCase()))
      .reduce((sum, e) => sum + e.occurrenceCount, 0) / total;
  const tensionShare = 1 - positiveShare;

  // Five samples across the night, peaking in deep sleep — the arc the design draws.
  const shape = [0.35, 0.85, 0.4, 0.95, 0.6];
  const tensionShape = [0.3, 0.18, 0.5, 0.22, 0.3];

  return shape.map((value, i) => ({
    t: i / (shape.length - 1),
    positive: value * Math.max(positiveShare, 0.15),
    tension: (tensionShape[i] ?? 0.3) * Math.max(tensionShare, 0.1),
    label: CLOCK[i] ?? '',
  }));
}

/** Below this many logged pairs the chart is more noise than pattern. */
const MIN_SCATTER_POINTS = 5;

export interface ScatterData {
  bubbles: ScatterBubble[];
  trend: ScatterTrend | null;
  /** The sleep-quality threshold named in the caption sentence, or `null` when
   * the data is too sparse or shows no positive relationship to name one. */
  captionQuality: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Turns raw (sleep quality, clarity) pairs into the scatter's bubbles, a linear
 * trend line, and — when the trend is positive enough to be worth naming — the
 * threshold quality used in the caption sentence.
 *
 * The threshold is the lowest sleep-quality bucket whose mean clarity is within
 * 0.5 of the best bucket's mean: "your clearest dreams follow nights rated N or
 * higher" is a claim about where the plateau starts, not just where the single
 * best-average bucket happens to sit.
 */
export function buildScatterData(points: SleepClarityPoint[]): ScatterData {
  if (points.length < MIN_SCATTER_POINTS) return { bubbles: [], trend: null, captionQuality: null };

  const bucketed = new Map<string, ScatterBubble>();
  for (const p of points) {
    const key = `${p.sleepQuality}-${p.clarity}`;
    const existing = bucketed.get(key);
    if (existing) existing.count += 1;
    else bucketed.set(key, { x: p.sleepQuality, y: p.clarity, count: 1 });
  }
  const bubbles = Array.from(bucketed.values());

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.sleepQuality, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.clarity, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.sleepQuality - meanX) * (p.clarity - meanY);
    denominator += (p.sleepQuality - meanX) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  const trend: ScatterTrend = {
    x1: 1,
    y1: clamp(intercept + slope * 1, 1, 5),
    x2: 5,
    y2: clamp(intercept + slope * 5, 1, 5),
  };

  let captionQuality: number | null = null;
  // A near-flat or negative slope has nothing honest to claim about "higher is clearer".
  if (slope > 0.05) {
    const byQuality = new Map<number, { sum: number; count: number }>();
    for (const p of points) {
      const bucket = byQuality.get(p.sleepQuality) ?? { sum: 0, count: 0 };
      bucket.sum += p.clarity;
      bucket.count += 1;
      byQuality.set(p.sleepQuality, bucket);
    }
    const means = Array.from(byQuality.entries())
      .map(([quality, b]) => ({ quality, mean: b.sum / b.count }))
      .sort((a, b) => a.quality - b.quality);
    const maxMean = Math.max(...means.map(m => m.mean));
    captionQuality = means.find(m => m.mean >= maxMean - 0.5)?.quality ?? null;
  }

  return { bubbles, trend, captionQuality };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  headerMeta: {
    ...typography.meta,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.screenTitle,
  },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: 18,
    paddingBottom: 12,
  },
  surfacePanel: {
    borderRadius: radius.panel,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 2,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  panelTitle: {
    ...typography.cardTitle,
  },
  panelMeta: {
    ...typography.meta,
    fontSize: 11,
  },
  panelLegend: {
    ...typography.meta,
    fontSize: 12,
    marginBottom: 6,
  },
  panelTitleSecondary: {
    ...typography.cardTitle,
    fontSize: 14,
  },
  panelCaption: {
    ...typography.meta,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
  },
  chainList: {
    gap: spacing.sm,
  },
  chainCard: {
    borderRadius: radius.thumb,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 2,
    gap: 4,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
  },
  chainRowDate: {
    ...typography.counter,
    width: 44,
  },
  chainRowTitle: {
    ...typography.body,
    fontSize: 13,
    flex: 1,
  },
  upgradeCard: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.borderMystic,
    padding: spacing.md + 2,
    gap: spacing.sm,
  },
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  premiumDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.highlight,
  },
  premiumLabel: {
    ...typography.overline,
    color: colors.highlight,
  },
  upgradeTitle: {
    ...typography.cardTitle,
    fontSize: 15,
  },
  upgradeBody: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  upgradeCta: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
});
