import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { EmptyState } from '@shared/components/EmptyState';
import { DreamCard, type JournalEntry } from '@features/journal/DreamCard';
import { useJournalSearch } from '@features/journal/useJournalSearch';
import { useJournalFilters } from '@features/journal/useJournalFilters';
import { syncPendingDreams } from '@features/dream-log/syncService';
import { pullRemoteChanges } from '@features/sync/pullService';
import { makeMediaCache } from '@features/sync/mediaCache';
import { useServices } from '@services/useServices';
import { colors, gradients, radius, spacing, typography } from '@theme/tokens';

const PAGE_SIZE = 20;

export default function JournalListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const listRef = useRef<FlashListRef<JournalEntry>>(null);
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const { auth } = services;

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
        dream_emotions: string | null;
        emotions: string | null;
        interpretation_id: string | null;
        is_lucid: number;
        tone: string | null;
        clarity: number | null;
        dream_type: string | null;
      }>(
        `
        SELECT d.id, d.description, d.occurred_at, d.sync_status,
               m.local_cache_path as thumbnail_uri,
               d.emotions as dream_emotions,
               i.emotions as emotions,
               i.id as interpretation_id,
               d.is_lucid, d.tone, d.clarity, d.dream_type
        FROM dreams d
        LEFT JOIN media m ON m.id = (
          SELECT id FROM media
          WHERE dream_id = d.id AND media_type = 'image' AND generation_status = 'complete'
          ORDER BY created_at DESC
          LIMIT 1
        )
        LEFT JOIN interpretations i ON i.id = (
          SELECT id FROM interpretations
          WHERE dream_id = d.id
          ORDER BY created_at DESC
          LIMIT 1
        )
        WHERE d.is_deleted = 0
        -- occurred_at is date-only ('2026-08-26'), so every dream logged on the same
        -- night sorts equal and SQLite is free to return them in any order. logged_at
        -- is a full timestamp and breaks the tie, which is what makes "most recent
        -- first" actually true within a day.
        ORDER BY d.occurred_at DESC, d.logged_at DESC
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
          // What the dreamer said they felt outranks what the AI read: they were
          // there. The interpretation's emotions stand in only until the dream has
          // its own — which is every dream logged before the log screen collected them.
          emotions: pickEmotions(r.dream_emotions, r.emotions),
          hasInterpretation: Boolean(r.interpretation_id),
          isLucid: Boolean(r.is_lucid),
          tone: r.tone as JournalEntry['tone'],
          clarity: r.clarity,
          dreamType: parseStringArray(r.dream_type),
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

  /**
   * Pressing the Journal tab while already inside the Journal stack returns here and lands
   * at the top of the list, rather than wherever the user had scrolled to before opening a
   * dream. The TabBar emits `tabPress` before it pops the stack, and this list stays mounted
   * underneath the detail screen, so by the time the pop reveals it the offset is already
   * reset.
   *
   * The listener goes on the parent (tab) navigator: `tabPress` is emitted there, not on this
   * screen's own Stack.
   */
  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    return parent.addListener('tabPress' as never, () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [navigation]);

  // Pull-to-refresh: reconcile with Supabase on demand (push this device's pending
  // changes, then pull remote ones — including deletions made elsewhere, which
  // otherwise only get picked up on the next foreground/reconnect/login cycle)
  // before re-reading the local list.
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const session = await auth.getSession();
      if (session) {
        try {
          await syncPendingDreams();
        } catch (err) {
          console.error('Push sync on pull-to-refresh failed:', err);
        }
        try {
          await pullRemoteChanges(session.user.id, makeMediaCache(services));
        } catch (err) {
          console.error('Pull sync on pull-to-refresh failed:', err);
        }
      }
      await loadEntries();
    } finally {
      setIsRefreshing(false);
    }
  }, [auth, services, loadEntries]);

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
          ref={listRef}
          data={displayEntries}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <DreamCard entry={item} variant="full" onPress={openDream} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={displayEntries.length > 0 ? <WeeklyInsight /> : null}
          showsVerticalScrollIndicator={false}
          refreshing={isRefreshing}
          onRefresh={() => void onRefresh()}
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
    // Emotions are written by the interpretation Edge Function and by the log screen;
    // a malformed row should degrade to "no chips", never crash the journal.
    return [];
  }
}

/** The dreamer's own emotions where there are any, the AI's reading otherwise. */
function pickEmotions(
  dreamEmotions: string | null,
  interpretationEmotions: string | null
): string[] {
  const own = parseEmotions(dreamEmotions);
  return own.length > 0 ? own : parseEmotions(interpretationEmotions);
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
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
