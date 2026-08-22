import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { RecurrencePattern } from './recurrenceRepository';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

interface TopRecurrencesViewProps {
  keywords: RecurrencePattern[];
  emotions: RecurrencePattern[];
}

function PatternChip({ pattern, onPress }: { pattern: RecurrencePattern; onPress: () => void }) {
  const icon = pattern.patternType === 'emotion' ? '💭' : '🔮';
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress} accessibilityRole="button">
      <Text style={styles.chipIcon}>{icon}</Text>
      <Text style={styles.chipText}>{pattern.term}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{pattern.occurrenceCount}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function TopRecurrencesView({ keywords, emotions }: TopRecurrencesViewProps) {
  const router = useRouter();

  if (keywords.length === 0 && emotions.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Recurring Themes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {keywords.map(k => (
          <PatternChip
            key={k.id}
            pattern={k}
            onPress={() => router.push(`/(main)/journal?filterKeyword=${k.term}`)}
          />
        ))}
        {emotions.map(e => (
          <PatternChip
            key={e.id}
            pattern={e}
            onPress={() => router.push(`/(main)/journal?filterEmotion=${e.term}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, color: '#888', fontWeight: '600', paddingHorizontal: spacing.md },
  scroll: { paddingHorizontal: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginRight: spacing.xs,
    gap: 4,
  },
  chipIcon: { fontSize: 14 },
  chipText: { fontSize: 13, color: '#ccc' },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: '600' },
});
