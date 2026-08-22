import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, TextInput, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { EmptyState } from '@shared/components/EmptyState';
import { JournalEntryCard, type JournalEntry } from '@features/journal/JournalEntryCard';
import { useJournalSearch } from '@features/journal/useJournalSearch';
import { useJournalFilters } from '@features/journal/useJournalFilters';
import { spacing } from '@shared/tokens/spacing';
import { useRouter } from 'expo-router';

const PAGE_SIZE = 20;

export default function JournalListScreen() {
  const router = useRouter();
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
      }>(
        `
        SELECT d.id, d.description, d.occurred_at, d.sync_status,
               m.storage_key as thumbnail_uri
        FROM dreams d
        LEFT JOIN media m ON m.dream_id = d.id AND m.media_type = 'image' AND m.generation_status = 'complete'
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
        }))
      );
    } catch {
      // Silently handle — entries stays []
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

  const noResults = searchQuery.trim() && displayEntries.length === 0 && !isSearching;
  const noDreams = !searchQuery.trim() && !filterResults && entries.length === 0 && !isLoading;

  if (isLoading) return <LoadingState message="Loading your dreams..." />;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchBar}
        placeholder="Search dreams..."
        placeholderTextColor="#555"
        value={searchQuery}
        onChangeText={text => {
          setSearchQuery(text);
          if (text) search(text);
          else clearSearch();
        }}
        accessibilityLabel="Search dreams"
        clearButtonMode="while-editing"
      />

      {noDreams ? (
        <EmptyState
          icon="🌙"
          title="Your dream journal is empty"
          subtitle="Log your first dream to get started."
          ctaLabel="Log a Dream"
          onCta={() => router.navigate('/(main)/log')}
        />
      ) : noResults ? (
        <EmptyState
          icon="🔍"
          title="No dreams match this search"
          subtitle="Try different keywords or clear the search."
          ctaLabel="Clear Search"
          onCta={() => {
            setSearchQuery('');
            clearSearch();
          }}
        />
      ) : (
        <FlashList
          data={displayEntries}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <JournalEntryCard entry={item} />}
          estimatedItemSize={88}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  searchBar: {
    margin: spacing.md,
    padding: spacing.sm,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
  },
  list: {
    paddingBottom: spacing.xl,
  },
});
