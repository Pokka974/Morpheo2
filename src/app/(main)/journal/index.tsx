import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { EmptyState } from '@shared/components/EmptyState';
import { DreamCard, type JournalEntry } from '@features/journal/DreamCard';
import { useJournalSearch } from '@features/journal/useJournalSearch';
import { useJournalFilters } from '@features/journal/useJournalFilters';
import { colors, gradients, radius, spacing, typography } from '@theme/tokens';

const PAGE_SIZE = 20;

export default function JournalListScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { results: searchResults, isSearching, search, clearSearch } = useJournalSearch();
  const { results: filterResults } = useJournalFilters();

  const loadEntries = useCallback(async () => {
    try {
      const rows = await db.getAllAsync<{
        id: string;
        description: string;
        occurred_at: string;
        sync_status: string;
        thumbnail_uri: string | null;
        emotions: string | null;
        interpretation_id: string | null;
      }>(
        `
        SELECT d.id, d.description, d.occurred_at, d.sync_status,
               m.storage_key as thumbnail_uri,
               i.emotions as emotions,
               i.id as interpretation_id
        FROM dreams d
        LEFT JOIN media m ON m.dream_id = d.id AND m.media_type = 'image' AND m.generation_status = 'complete'
        LEFT JOIN interpretations i ON i.dream_id = d.id
        WHERE d.is_deleted = 0
        ORDER BY d.occurred_at DESC
        LIMIT ?
      `,
        PAGE_SIZE
      );

      setEntries(
        rows.map(r => ({
          id: r.id,
          description: r.description,
          occurredAt: r.occurred_at,
          syncStatus: r.sync_status as JournalEntry['syncStatus'],
          thumbnailUri: r.thumbnail_uri,
          emotions: parseEmotions(r.emotions),
          hasInterpretation: Boolean(r.interpretation_id),
        }))
      );
    } catch (err) {
      console.error('Failed to load journal entries:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEntries();
    }, [loadEntries])
  );

  const displayEntries: JournalEntry[] = (searchResults ?? filterResults ?? entries).map(r =>
    'occurredAt' in r
      ? (r as JournalEntry)
      : {
          id: (r as { id: string }).id,
          description: (r as { description: string }).description,
          occurredAt: (r as { occurredAt: string }).occurredAt,
          syncStatus: (r as { syncStatus: string }).syncStatus as JournalEntry['syncStatus'],
          thumbnailUri: null,
        }
  );

  const noResults = Boolean(searchQuery.trim()) && displayEntries.length === 0 && !isSearching;
  const noDreams = !searchQuery.trim() && !filterResults && entries.length === 0 && !isLoading;

  const openDream = useCallback(
    (id: string) => router.push(`/(main)/journal/${id}/detail`),
    [router]
  );

  const today = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (isLoading) return <LoadingState message={t('journal.loading')} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerDate}>{today}</Text>
          <Text style={styles.headerTitle}>{t('common.appName')}</Text>
        </View>
        <View style={styles.avatar}>
          <View style={styles.moon} />
        </View>
      </View>

      <View style={styles.searchField}>
        <View style={styles.searchGlyph} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('journal.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={text => {
            setSearchQuery(text);
            if (text) search(text);
            else clearSearch();
          }}
          accessibilityLabel={t('journal.searchLabel')}
          clearButtonMode="while-editing"
        />
      </View>

      {noDreams ? (
        <EmptyState
          title={t('journal.emptyTitle')}
          subtitle={t('journal.emptySubtitle')}
          ctaLabel={t('journal.emptyCta')}
          onCta={() => router.navigate('/(main)/log')}
        />
      ) : noResults ? (
        <EmptyState
          title={t('journal.noResultsTitle')}
          subtitle={t('journal.noResultsSubtitle')}
          ctaLabel={t('journal.noResultsCta')}
          onCta={() => {
            setSearchQuery('');
            clearSearch();
          }}
        />
      ) : (
        <FlashList
          data={displayEntries}
          keyExtractor={item => item.id}
          renderItem={({ item, index }) => (
            <DreamCard
              entry={item}
              // The newest dream leads with the full card; the rest stay compact so
              // the list scans quickly.
              variant={index === 0 ? 'full' : 'compact'}
              onPress={openDream}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={displayEntries.length > 0 ? <WeeklyInsight /> : null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** The amber-marked takeaway that closes the list in the design. */
function WeeklyInsight() {
  const { t } = useTranslation();
  return (
    <LinearGradient
      colors={[...gradients.mystic.colors]}
      locations={[...gradients.mystic.locations]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.insightCard}
    >
      <Text style={styles.insightOverline}>{t('journal.weekInsight')}</Text>
      <Text style={styles.insightBody}>{t('insights.starHint')}</Text>
    </LinearGradient>
  );
}

function parseEmotions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    // Emotions are written by the interpretation Edge Function; a malformed row
    // should degrade to "no chips", never crash the journal.
    return [];
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
  },
  headerText: {
    gap: spacing.xs,
  },
  headerDate: {
    ...typography.meta,
  },
  headerTitle: {
    ...typography.dreamTitle,
    fontSize: 30,
    lineHeight: 34,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moon: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.accentText,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: spacing.md,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchGlyph: {
    width: 13,
    height: 13,
    borderRadius: radius.full,
    borderWidth: 1.6,
    borderColor: colors.textMuted,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: 12,
  },
  insightCard: {
    marginTop: 12,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderMystic,
    gap: 7,
  },
  insightOverline: {
    ...typography.overline,
    color: colors.highlight,
  },
  insightBody: {
    ...typography.dreamBody,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
