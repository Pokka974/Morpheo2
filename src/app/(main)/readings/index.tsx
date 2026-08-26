import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { LoadingState } from '@shared/components/LoadingState';
import { EmptyState } from '@shared/components/EmptyState';
import { Chip, ChipRow } from '@shared/components/Chip';
import { getTopRecurrences } from '@features/recurrence/recurrenceRepository';
import { getReadings, type ReadingEntry } from '@features/readings/readingsRepository';
import { supabase } from '../../../supabase/client';
import { colors, radius, spacing, typography } from '@theme/tokens';

const FILTER_LIMIT = 8;

const DENSITY: Record<NonNullable<ReadingEntry['confidence']>, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export default function ReadingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [readings, setReadings] = useState<ReadingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }
      setUserId(user.id);
      const top = await getTopRecurrences(user.id, 'keyword', FILTER_LIMIT);
      setFilters(top.map(p => p.term));
    }
    void init();
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const entries = await getReadings(userId, activeFilter ?? undefined);
      setReadings(entries);
    } catch (err) {
      console.error('Failed to load readings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, activeFilter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (isLoading) return <LoadingState message={t('readings.loading')} />;

  if (readings.length === 0 && !activeFilter) {
    return (
      <EmptyState
        title={t('readings.emptyTitle')}
        subtitle={t('readings.emptySubtitle')}
        ctaLabel={t('readings.emptyCta')}
        onCta={() => router.push('/(main)/log')}
      />
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headerMeta}>
        {t('readings.subtitle', {
          count: readings.length,
          since: readings[readings.length - 1]?.occurredAt
            ? new Date(readings[readings.length - 1]!.occurredAt).toLocaleDateString(
                i18n.language,
                { month: 'long', year: 'numeric' }
              )
            : '',
        })}
      </Text>
      <Text style={styles.headerTitle}>{t('readings.title')}</Text>

      {filters.length > 0 ? (
        <ChipRow>
          <FilterChip
            label={t('readings.filterAll')}
            selected={activeFilter === null}
            onPress={() => setActiveFilter(null)}
          />
          {filters.map(term => (
            <FilterChip
              key={term}
              label={term}
              selected={activeFilter === term}
              onPress={() => setActiveFilter(term)}
            />
          ))}
        </ChipRow>
      ) : null}

      {readings.length === 0 ? (
        <EmptyState
          title={t('readings.noResultsTitle')}
          subtitle={t('readings.noResultsSubtitle')}
          ctaLabel={t('readings.noResultsCta')}
          onCta={() => setActiveFilter(null)}
        />
      ) : (
        <View style={styles.list}>
          {readings.map(entry => (
            <ReadingCard
              key={entry.dreamId}
              entry={entry}
              onPress={() => router.push(`/(main)/journal/${entry.dreamId}/detail`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
    >
      <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DensityDots({ confidence }: { confidence: ReadingEntry['confidence'] }) {
  const { t } = useTranslation();
  if (!confidence) return null;
  const filled = DENSITY[confidence];

  return (
    <View style={styles.densityWrap}>
      <Text style={styles.densityLabel}>{t('readings.densityLabel')}</Text>
      <View style={styles.densityRow}>
        {[1, 2, 3].map(step => (
          <View key={step} style={[styles.densityDot, step <= filled && styles.densityDotFilled]} />
        ))}
      </View>
    </View>
  );
}

function ReadingCard({ entry, onPress }: { entry: ReadingEntry; onPress: () => void }) {
  const { t, i18n } = useTranslation();

  const dateLabel = new Date(entry.occurredAt).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.openReading', { title: entry.title })}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.cardMeta}>{dateLabel}</Text>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {entry.title}
      </Text>

      {entry.status === 'ready' ? (
        <>
          {entry.keywords.length > 0 ? (
            <ChipRow>
              {entry.keywords.slice(0, 4).map(keyword => (
                <Chip key={keyword} label={keyword} variant="keyword" />
              ))}
            </ChipRow>
          ) : null}
          {entry.excerpt ? (
            <Text style={styles.cardExcerpt} numberOfLines={3}>
              {entry.excerpt}
            </Text>
          ) : null}
          <DensityDots confidence={entry.confidence} />
          <Text style={styles.cardCta}>{t('readings.cta')}</Text>
        </>
      ) : entry.status === 'short' ? (
        <>
          <Text style={styles.cardStateTitle}>{t('readings.shortTitle')}</Text>
          <Text style={styles.cardExcerpt}>{t('readings.shortBody')}</Text>
          <Text style={styles.cardCta}>{t('readings.ctaShort')}</Text>
        </>
      ) : (
        <>
          <Text style={styles.cardStateTitle}>{t('readings.failedTitle')}</Text>
          <Text style={styles.cardExcerpt}>{t('readings.failedBody')}</Text>
          <Text style={styles.cardCta}>{t('readings.ctaRetry')}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm + 4,
  },
  headerMeta: {
    ...typography.meta,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.screenTitle,
    marginBottom: spacing.xs,
  },
  list: {
    gap: spacing.sm + 4,
  },
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardMeta: {
    ...typography.meta,
    fontSize: 12,
  },
  cardTitle: {
    ...typography.dreamTitle,
    fontSize: 18,
    lineHeight: 23,
  },
  cardStateTitle: {
    ...typography.cardTitle,
    fontSize: 14,
  },
  cardExcerpt: {
    ...typography.dreamBody,
    fontSize: 13.5,
    lineHeight: 21,
  },
  cardCta: {
    ...typography.chip,
    color: colors.accentText,
    marginTop: 4,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderElevated,
    backgroundColor: colors.chipNeutralFill,
  },
  filterChipSelected: {
    borderStyle: 'solid',
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}1f`,
  },
  filterChipLabel: {
    ...typography.chip,
    color: colors.textMuted,
  },
  filterChipLabelSelected: {
    color: colors.accentText,
  },
  densityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  densityLabel: {
    ...typography.overline,
    fontSize: 9.5,
  },
  densityRow: {
    flexDirection: 'row',
    gap: 4,
  },
  densityDot: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
    borderWidth: 1,
    borderColor: colors.borderElevated,
    transform: [{ rotate: '45deg' }],
  },
  densityDotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
