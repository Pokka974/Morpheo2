import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LoadingState } from '@shared/components/LoadingState';
import { getTopRecurrences, type RecurrencePattern } from './recurrenceRepository';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';
import { useRouter } from 'expo-router';

type TimeRange = 30 | 90 | 0; // 0 = all time

interface RecurrenceAnalyticsViewProps {
  userId: string;
}

export function RecurrenceAnalyticsView({ userId }: RecurrenceAnalyticsViewProps) {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>(30);
  const [keywords, setKeywords] = useState<RecurrencePattern[]>([]);
  const [emotions, setEmotions] = useState<RecurrencePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const days = timeRange === 0 ? undefined : timeRange;
        const [kw, em] = await Promise.all([
          getTopRecurrences(userId, 'keyword', 10, days),
          getTopRecurrences(userId, 'emotion', 10, days),
        ]);
        setKeywords(kw);
        setEmotions(em);
      } catch {
        // leave empty
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [userId, timeRange]);

  const ranges: { label: string; value: TimeRange }[] = [
    { label: '30d', value: 30 },
    { label: '90d', value: 90 },
    { label: 'All Time', value: 0 },
  ];

  if (isLoading) return <LoadingState message="Loading insights..." />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.rangeSelector}>
        {ranges.map(r => (
          <TouchableOpacity
            key={r.value}
            style={[styles.rangeButton, timeRange === r.value && styles.rangeButtonActive]}
            onPress={() => setTimeRange(r.value)}
            accessibilityRole="button"
          >
            <Text style={[styles.rangeText, timeRange === r.value && styles.rangeTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {keywords.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Symbols</Text>
          {keywords.map(k => (
            <TouchableOpacity
              key={k.id}
              style={styles.row}
              onPress={() => router.push(`/(main)/journal?filterKeyword=${k.term}`)}
              accessibilityRole="button"
            >
              <Text style={styles.term}>{k.term}</Text>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { flex: k.occurrenceCount }]} />
              </View>
              <Text style={styles.count}>{k.occurrenceCount}×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {emotions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recurring Emotions</Text>
          {emotions.map(e => (
            <TouchableOpacity
              key={e.id}
              style={styles.row}
              onPress={() => router.push(`/(main)/journal?filterEmotion=${e.term}`)}
              accessibilityRole="button"
            >
              <Text style={styles.term}>{e.term}</Text>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { flex: e.occurrenceCount }]} />
              </View>
              <Text style={styles.count}>{e.occurrenceCount}×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {keywords.length === 0 && emotions.length === 0 && (
        <Text style={styles.empty}>No recurring patterns found for this time range.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.lg },
  rangeSelector: { flexDirection: 'row', gap: spacing.xs },
  rangeButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, backgroundColor: '#1a1a2e' },
  rangeButtonActive: { backgroundColor: colors.primary },
  rangeText: { color: '#888', fontSize: 13 },
  rangeTextActive: { color: '#fff', fontWeight: '600' },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, color: '#888', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  term: { width: 100, fontSize: 13, color: '#ccc' },
  barContainer: { flex: 1, height: 8, backgroundColor: '#1a1a2e', borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
  count: { width: 28, fontSize: 12, color: '#888', textAlign: 'right' },
  empty: { color: '#555', textAlign: 'center', marginTop: spacing.xl },
});
