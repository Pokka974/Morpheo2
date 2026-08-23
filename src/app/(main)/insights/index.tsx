import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { LoadingState } from '@shared/components/LoadingState';
import { Button } from '@shared/components/Button';
import { Chip, ChipRow } from '@shared/components/Chip';
import {
  ConstellationChart,
  type ConstellationNode,
} from '@features/recurrence/ConstellationChart';
import { EmotionRibbon, type RibbonPoint } from '@features/recurrence/EmotionRibbon';
import {
  getTopRecurrences,
  type RecurrencePattern,
} from '@features/recurrence/recurrenceRepository';
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
      const [kw, em] = await Promise.all([
        getTopRecurrences(userId, 'keyword', limit, days),
        getTopRecurrences(userId, 'emotion', limit, days),
      ]);
      setKeywords(kw);
      setEmotions(em);
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
          <View style={styles.periodSwitch}>
            {(['30', '90', 'all'] as const).map(value => (
              <PeriodTab
                key={value}
                value={value}
                active={period === value}
                onPress={() => setPeriod(value)}
              />
            ))}
          </View>
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

function PeriodTab({
  value,
  active,
  onPress,
}: {
  value: Period;
  active: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const label = t(
    value === '30'
      ? 'insights.period30'
      : value === '90'
        ? 'insights.period90'
        : 'insights.periodAll'
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={t('a11y.selectPeriod', { period: label })}
      style={[styles.periodTab, active && styles.periodTabActive]}
    >
      <Text
        style={[styles.periodLabel, active ? styles.periodLabelActive : styles.periodLabelIdle]}
      >
        {label}
      </Text>
    </Pressable>
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
  periodSwitch: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodTab: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  periodTabActive: {
    backgroundColor: colors.accent,
  },
  periodLabel: {
    ...typography.chip,
  },
  periodLabelActive: {
    color: colors.textOnAccent,
  },
  periodLabelIdle: {
    color: colors.textMuted,
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
