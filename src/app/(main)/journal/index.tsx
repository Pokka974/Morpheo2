import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { EmptyState } from '@shared/components/EmptyState';
import { DreamCard, type JournalEntry } from '@features/journal/DreamCard';
import {
  JOURNAL_ENTRY_COLUMNS,
  JOURNAL_ENTRY_JOINS,
  JOURNAL_ENTRY_ORDER,
  JOURNAL_ENTRY_SCOPE,
  mapJournalEntryRow,
  type JournalEntryRow,
} from '@features/journal/journalEntryQuery';
import {
  JournalFilterSheet,
  PERIOD_KEYS,
  type FilterPeriod,
} from '@features/journal/JournalFilterSheet';
import { Chip, ChipRow } from '@shared/components/Chip';
import { useJournalSearch } from '@features/journal/useJournalSearch';
import { useJournalFilters } from '@features/journal/useJournalFilters';
import { FilterIcon, SearchIcon } from '@shared/components/icons';
import { syncPendingDreams } from '@features/dream-log/syncService';
import {
  isPullInFlight,
  pullRemoteChanges,
  subscribeToPullActivity,
} from '@features/sync/pullService';
import { makeMediaCache } from '@features/sync/mediaCache';
import { useServices } from '@services/useServices';
import {
  colors,
  gradients,
  MIN_TOUCH_TARGET,
  radius,
  sizes,
  spacing,
  typography,
} from '@theme/tokens';

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
  // A backfill may already be running before this screen mounts — the sign-in pull is
  // started from the root layout, whose effects run after its children's.
  const [isSyncing, setIsSyncing] = useState(isPullInFlight);
  const [searchQuery, setSearchQuery] = useState('');
  // Resolved by `loadEntries` on focus, and handed to search and filters so all three
  // sources stay scoped to the same account.
  const [userId, setUserId] = useState<string | null>(null);
  const { results: searchResults, isSearching, search, clearSearch } = useJournalSearch(userId);
  const { filters, results: filterResults, applyFilters, clearFilters } = useJournalFilters(userId);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  // The window that produced `filters.startDate`, kept alongside it so the chip and the
  // sheet keep naming it correctly even after the date it was derived from has passed.
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('all');

  const loadEntries = useCallback(async () => {
    try {
      // The session is read here rather than in an effect of its own so that a focus
      // after an account switch re-reads it: the list and the account it belongs to
      // are resolved in the same pass, and can never disagree.
      const session = await auth.getSession();
      if (!session) {
        setUserId(null);
        setEntries([]);
        return;
      }
      setUserId(session.user.id);

      const rows = await db.getAllAsync<JournalEntryRow>(
        `
        SELECT ${JOURNAL_ENTRY_COLUMNS}
        FROM dreams d
        ${JOURNAL_ENTRY_JOINS}
        WHERE ${JOURNAL_ENTRY_SCOPE}
        ${JOURNAL_ENTRY_ORDER}
        LIMIT ?
      `,
        [session.user.id, PAGE_SIZE]
      );

      setEntries(rows.map(mapJournalEntryRow));
    } catch (err) {
      console.error('Failed to load journal entries:', err);
    } finally {
      setIsLoading(false);
    }
  }, [auth]);

  useFocusEffect(
    useCallback(() => {
      void loadEntries();
    }, [loadEntries])
  );

  // The sign-in pull is fire-and-forget and lands after this list has already read an
  // empty table — without this the journal stays empty until the user navigates away
  // and back, however many dreams the pull just wrote. The pull announces itself as it
  // goes, so the list fills in as the dreams land rather than after the last image has
  // finished downloading.
  useEffect(
    () =>
      subscribeToPullActivity(() => {
        setIsSyncing(isPullInFlight());
        void loadEntries();
      }),
    [loadEntries]
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
          await syncPendingDreams(makeMediaCache(services));
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

  // All three sources select the same card shape (see `journalEntryQuery`), so a
  // searched or filtered dream keeps its image, chips and markers.
  const displayEntries: JournalEntry[] = searchResults ?? filterResults ?? entries;

  const hasFilters = Boolean(filters.emotion || filters.startDate);

  const noResults = Boolean(searchQuery.trim()) && displayEntries.length === 0 && !isSearching;
  const noDreams = !searchQuery.trim() && !filterResults && entries.length === 0 && !isLoading;
  // A filtered-to-nothing list is not an empty journal: the dreams are there, the
  // filter just excludes them all. Without this the list rendered blank and silent.
  const noFilterMatches =
    !searchQuery.trim() && hasFilters && displayEntries.length === 0 && !isLoading;

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
        <Pressable
          onPress={() => setIsFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('journal.filterLabel')}
          accessibilityState={{ expanded: isFilterSheetOpen }}
          testID="journal-filter-button"
          style={({ pressed }) => [
            styles.filterButton,
            hasFilters && styles.filterButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <FilterIcon />
          {hasFilters ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>

      <View style={styles.searchField}>
        <SearchIcon />
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

      {hasFilters ? (
        <View style={styles.activeFilters}>
          <ChipRow style={styles.activeFilterChips}>
            {filters.emotion ? <Chip label={t(`emotions.${filters.emotion}`)} /> : null}
            {filters.startDate ? (
              <Chip label={t(PERIOD_KEYS[filterPeriod])} variant="keyword" />
            ) : null}
          </ChipRow>
          <Pressable
            onPress={() => {
              clearFilters();
              setFilterPeriod('all');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('journal.filterClearLabel')}
            hitSlop={spacing.sm}
            testID="journal-filters-clear"
          >
            <Text style={styles.clearFilters}>{t('journal.filterClear')}</Text>
          </Pressable>
        </View>
      ) : null}

      {/*
        Always the same FlashList, empty or not — its RefreshControl is what makes
        pull-to-refresh work at all, and a separate non-list element standing in for
        "no dreams yet" (as this used to do) has no scrollable surface for that gesture
        to attach to. That stranded a returning user exactly when they most needed
        pull-to-refresh: an empty journal *is* the state a stuck sync leaves behind, and
        without this they had no way to retry short of leaving the screen and coming
        back, which does not repull.
      */}
      <FlashList
        ref={listRef}
        data={displayEntries}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DreamCard entry={item} variant="full" onPress={openDream} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListFooterComponent={displayEntries.length > 0 ? <WeeklyInsight /> : null}
        ListEmptyComponent={
          noDreams ? (
            // An empty table while a backfill is running is not an empty journal — it
            // is a journal whose dreams are still on their way down. Offering "log
            // your first dream" there tells a returning user on a fresh install that
            // everything they have ever written is gone.
            isSyncing ? (
              <LoadingState message={t('journal.loading')} />
            ) : (
              <EmptyState
                title={t('journal.emptyTitle')}
                subtitle={t('journal.emptySubtitle')}
                ctaLabel={t('journal.emptyCta')}
                onCta={() => router.navigate('/(main)/log')}
              />
            )
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
          ) : noFilterMatches ? (
            <EmptyState
              title={t('journal.noFilterMatchesTitle')}
              subtitle={t('journal.noFilterMatchesSubtitle')}
              ctaLabel={t('journal.filterClear')}
              onCta={() => {
                clearFilters();
                setFilterPeriod('all');
              }}
            />
          ) : null
        }
        showsVerticalScrollIndicator={false}
        refreshing={isRefreshing}
        onRefresh={() => void onRefresh()}
      />

      <JournalFilterSheet
        visible={isFilterSheetOpen}
        filters={filters}
        period={filterPeriod}
        onApply={(next, period) => {
          applyFilters(next);
          setFilterPeriod(period);
          setIsFilterSheetOpen(false);
        }}
        onClear={() => {
          clearFilters();
          setFilterPeriod('all');
          setIsFilterSheetOpen(false);
        }}
        onCancel={() => setIsFilterSheetOpen(false)}
      />
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
  filterButton: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    borderColor: colors.accent,
  },
  /**
   * The active marker never carries the state on its own — the chips below the search
   * field name every filter in force, so this only has to draw the eye back up.
   */
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accentText,
  },
  pressed: {
    opacity: 0.85,
  },
  activeFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  activeFilterChips: {
    flex: 1,
    marginTop: 0,
  },
  clearFilters: {
    ...typography.chip,
    color: colors.accentText,
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
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    ...typography.body,
    fontSize: 14,
    color: colors.textPrimary,
  },
  list: {
    // flexGrow, not flex: this is a *content container* — FlashList sizes it to its
    // content by default, which is fine once there are cards to size to. An empty
    // list has none, so without this the EmptyState/LoadingState rendered as
    // ListEmptyComponent has no stretched parent to center itself within and
    // collapses to the top of the screen instead.
    flexGrow: 1,
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
