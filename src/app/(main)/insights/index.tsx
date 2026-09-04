import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
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
  getEmotionTonePoints,
  type EmotionTonePoint,
} from '@features/recurrence/emotionToneRepository';
import {
  getSleepClarityPoints,
  type SleepClarityPoint,
} from '@features/recurrence/sleepClarityRepository';
import { SleepClarityBars, type ClarityBar } from '@features/recurrence/SleepClarityBars';
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
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { entitlement } = useServices();

  const [isPremium, setIsPremium] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [keywords, setKeywords] = useState<RecurrencePattern[]>([]);
  const [emotions, setEmotions] = useState<RecurrencePattern[]>([]);
  const [sleepClarityPoints, setSleepClarityPoints] = useState<SleepClarityPoint[]>([]);
  const [tonePoints, setTonePoints] = useState<EmotionTonePoint[]>([]);
  const [chains, setChains] = useState<RecurrenceChain[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Focus rather than mount: a purchase completes on the paywall screen and returns
  // here, and without refetching on focus the premium-only view (period control, full
  // recurrence limit) would stay gated until the app restarts, even though load()
  // below already reacts to isPremium changing.
  useFocusEffect(
    useCallback(() => {
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
    }, [entitlement])
  );

  const load = useCallback(async () => {
    if (!userId) return;
    const limit = isPremium ? PREMIUM_LIMIT : FREE_LIMIT;
    // `undefined` means "all time"; the repository omits the date filter for it.
    const days = (isPremium ? PERIOD_DAYS[period] : FREE_WINDOW_DAYS) ?? undefined;
    try {
      const [kw, em, points, tone, recurrenceChains] = await Promise.all([
        getTopRecurrences(userId, 'keyword', limit, days),
        getTopRecurrences(userId, 'emotion', limit, days),
        getSleepClarityPoints(userId, days),
        getEmotionTonePoints(userId, days),
        getRecurrenceChains(userId),
      ]);
      setKeywords(kw);
      setEmotions(em);
      setSleepClarityPoints(points);
      setTonePoints(tone);
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

  const ribbon: RibbonPoint[] = useMemo(
    () => buildRibbon(tonePoints, i18n.language),
    [tonePoints, i18n.language]
  );
  const sleepClarity = useMemo(
    () => buildSleepClarityData(sleepClarityPoints),
    [sleepClarityPoints]
  );

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
        <Text style={styles.panelLegend}>
          {t('insights.constellationLegend')}
          {nodes.length >= 3 ? ` · ${t('insights.constellationZoomHint')}` : ''}
        </Text>
        <ConstellationChart nodes={nodes} testID="constellation" />
      </LinearGradient>

      <View style={styles.surfacePanel}>
        <Text style={styles.panelTitle}>{t('insights.ribbonTitle')}</Text>
        {ribbon.length >= 2 ? (
          <>
            <Text style={styles.panelLegend}>
              {t('insights.ribbonSubtitle', { period: periodLabel })}
            </Text>
            <EmotionRibbon points={ribbon} testID="emotion-ribbon" />
          </>
        ) : (
          <>
            <Text style={styles.panelTitleSecondary}>{t('insights.ribbonEmptyTitle')}</Text>
            <Text style={styles.panelLegend}>{t('insights.ribbonEmptyBody')}</Text>
          </>
        )}
      </View>

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
        {sleepClarity.bars.length > 0 ? (
          <>
            <Text style={styles.panelLegend}>
              {t('insights.sleepClaritySubtitle', { period: periodLabel })}
            </Text>
            <SleepClarityBars
              bars={sleepClarity.bars}
              highlightQuality={sleepClarity.captionQuality}
              testID="sleep-clarity-bars"
            />
            {sleepClarity.captionQuality != null ? (
              <Text style={styles.panelCaption}>
                {t('insights.sleepClarityCaption', { quality: sleepClarity.captionQuality })}
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
 * The emotional tone of the journal across the selected period.
 *
 * This replaces a chart that was decorative. The old ribbon drew a hardcoded
 * five-point squiggle over an invented 23h–07h clock axis, scaled by a single
 * ratio — its shape was identical for every user, and nothing in it came from the
 * dreamer's nights. A night's *arc* is not recoverable either: a dream carries one
 * `occurred_at` and one set of emotions, never emotion sampled through the night.
 * The question this data can honestly answer is the one over time — are the last
 * few weeks of dreams lighter or heavier than the ones before them?
 *
 * The two curves are deliberately independent rather than complements. A dream can
 * be both free and afraid, and reading "share that felt good" against "share that
 * felt tense" says something a single positive-minus-negative score erases.
 */
const POSITIVE = new Set(['calm', 'joy', 'freedom', 'curiosity', 'wonder', 'nostalgia']);
const TENSION = new Set(['confusion', 'anxiety', 'fear', 'anger']);

/** Enough buckets to show a movement, few enough that each holds real dreams. */
const TONE_BUCKETS = 6;
/** Below this the curve would be joining the dots between one or two nights. */
const MIN_TONE_DREAMS = 4;

function hasAny(emotions: string[], set: Set<string>): boolean {
  return emotions.some(e => set.has(e.trim().toLowerCase()));
}

export function buildRibbon(points: EmotionTonePoint[], locale: string): RibbonPoint[] {
  if (points.length < MIN_TONE_DREAMS) return [];

  const times = points.map(p => new Date(p.occurredAt).getTime()).filter(n => Number.isFinite(n));
  if (times.length < MIN_TONE_DREAMS) return [];
  const first = Math.min(...times);
  const span = Math.max(...times) - first;
  // Every dream on the same day: there is no "over time" to draw.
  if (span <= 0) return [];

  const buckets: EmotionTonePoint[][] = Array.from({ length: TONE_BUCKETS }, () => []);
  for (const point of points) {
    const at = new Date(point.occurredAt).getTime();
    if (!Number.isFinite(at)) continue;
    // The most recent dream lands in the final bucket, not one past the end.
    const index = Math.min(TONE_BUCKETS - 1, Math.floor(((at - first) / span) * TONE_BUCKETS));
    buckets[index]!.push(point);
  }

  // A quiet stretch is a gap in the record, not a zero — drop empty buckets rather
  // than drawing the curve to the floor on nights that were never logged.
  const filled = buckets
    .map((dreams, index) => ({ dreams, index }))
    .filter(b => b.dreams.length > 0);
  if (filled.length < 2) return [];

  const dayMonth: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  /**
   * Over a short span the six bucket midpoints fall hours apart, so two of the three
   * labelled ones format to the very same day. Printing "25 août" twice on one axis
   * says nothing, and it used to collide as a React key besides, which silently
   * dropped one of the two labels. The first bucket to claim a date keeps it.
   */
  const usedLabels = new Set<string>();

  return filled.map((bucket, i) => {
    const total = bucket.dreams.length;
    const midpoint = new Date(first + ((bucket.index + 0.5) / TONE_BUCKETS) * span);
    // Label the two ends and the middle only; six dates across 320 units collide.
    const isLabelled = i === 0 || i === filled.length - 1 || i === Math.floor(filled.length / 2);
    const label = isLabelled ? midpoint.toLocaleDateString(locale, dayMonth) : undefined;
    const isDistinct = label !== undefined && !usedLabels.has(label);
    if (isDistinct) usedLabels.add(label);

    return {
      t: i / (filled.length - 1),
      positive: bucket.dreams.filter(d => hasAny(d.emotions, POSITIVE)).length / total,
      tension: bucket.dreams.filter(d => hasAny(d.emotions, TENSION)).length / total,
      ...(isDistinct ? { label } : {}),
    };
  });
}

/** Below this many logged nights the chart is more noise than pattern. */
const MIN_SLEEP_NIGHTS = 5;

export interface SleepClarityData {
  bars: ClarityBar[];
  /** The sleep-quality threshold named in the caption sentence, and the rating from
   * which the bars turn amber. `null` when the data is too sparse, or shows no
   * positive relationship worth claiming one. */
  captionQuality: number | null;
}

/**
 * Turns raw (sleep quality, clarity) pairs into one bar per sleep rating, plus the
 * threshold the caption names.
 *
 * The threshold is the lowest sleep-quality bucket whose mean clarity is within 0.5
 * of the best bucket's mean: "your clearest dreams follow nights rated N or higher"
 * is a claim about where the plateau starts, not just where the single best-average
 * bucket happens to sit. It is only claimed at all when the least-squares slope of
 * clarity on sleep quality is positive — a flat or negative relationship has nothing
 * honest to say about sleeping better.
 */
export function buildSleepClarityData(points: SleepClarityPoint[]): SleepClarityData {
  if (points.length < MIN_SLEEP_NIGHTS) return { bars: [], captionQuality: null };

  const byQuality = new Map<number, { sum: number; count: number }>();
  for (const p of points) {
    const bucket = byQuality.get(p.sleepQuality) ?? { sum: 0, count: 0 };
    bucket.sum += p.clarity;
    bucket.count += 1;
    byQuality.set(p.sleepQuality, bucket);
  }

  const bars: ClarityBar[] = Array.from(byQuality.entries())
    .map(([quality, b]) => ({ quality, meanClarity: b.sum / b.count, count: b.count }))
    .sort((a, b) => a.quality - b.quality);

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

  let captionQuality: number | null = null;
  if (slope > 0.05) {
    const maxMean = Math.max(...bars.map(b => b.meanClarity));
    captionQuality = bars.find(b => b.meanClarity >= maxMean - 0.5)?.quality ?? null;
  }

  return { bars, captionQuality };
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
