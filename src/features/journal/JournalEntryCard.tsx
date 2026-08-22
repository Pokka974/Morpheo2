import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

export interface JournalEntry {
  id: string;
  description: string;
  occurredAt: string;
  syncStatus: 'local' | 'sync_pending' | 'synced' | 'sync_failed';
  thumbnailUri?: string | null;
}

interface JournalEntryCardProps {
  entry: JournalEntry;
}

export function JournalEntryCard({ entry }: JournalEntryCardProps) {
  const router = useRouter();
  const snippet = entry.description.slice(0, 80);
  const date = new Date(entry.occurredAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const isPending = entry.syncStatus === 'sync_pending' || entry.syncStatus === 'local';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(main)/journal/${entry.id}/detail`)}
      accessibilityRole="button"
      accessibilityLabel={`Dream from ${date}: ${snippet}`}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.date}>{date}</Text>
          {isPending && (
            <Text style={styles.syncBadge} accessibilityLabel="Sync pending">
              ⬆
            </Text>
          )}
        </View>
        <Text style={styles.snippet} numberOfLines={2}>
          {snippet}
          {entry.description.length > 80 ? '…' : ''}
        </Text>
      </View>
      {entry.thumbnailUri ? (
        <Image
          source={{ uri: entry.thumbnailUri }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={300}
          accessibilityLabel="Dream thumbnail"
        />
      ) : (
        <View style={styles.thumbnailPlaceholder} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    overflow: 'hidden',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  date: {
    fontSize: 12,
    color: '#888',
    flex: 1,
  },
  syncBadge: {
    fontSize: 12,
    color: colors.primary,
  },
  snippet: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  thumbnail: {
    width: 72,
    height: 72,
  },
  thumbnailPlaceholder: {
    width: 72,
    height: 72,
    backgroundColor: '#0d0d1a',
  },
});
