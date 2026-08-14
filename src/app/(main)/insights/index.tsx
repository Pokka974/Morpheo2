import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LoadingState } from '@shared/components/LoadingState';
import { TopRecurrencesView } from '@features/recurrence/TopRecurrencesView';
import { RecurrenceAnalyticsView } from '@features/recurrence/RecurrenceAnalyticsView';
import { getTopRecurrences, type RecurrencePattern } from '@features/recurrence/recurrenceRepository';
import { useServices } from '@services/useServices';
import { supabase } from '../../../supabase/client';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

export default function InsightsScreen() {
  const router = useRouter();
  const { entitlement } = useServices();
  const [isPremium, setIsPremium] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [topKeywords, setTopKeywords] = useState<RecurrencePattern[]>([]);
  const [topEmotions, setTopEmotions] = useState<RecurrencePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const premium = await entitlement.isPremium();
      setIsPremium(premium);

      if (!premium) {
        const [kw, em] = await Promise.all([
          getTopRecurrences(user.id, 'keyword', 3, 30),
          getTopRecurrences(user.id, 'emotion', 3, 30),
        ]);
        setTopKeywords(kw);
        setTopEmotions(em);
      }
      setIsLoading(false);
    }
    init();
  }, [entitlement]);

  if (isLoading) return <LoadingState message="Loading insights..." />;

  if (isPremium && userId) {
    return <RecurrenceAnalyticsView userId={userId} />;
  }

  return (
    <View style={styles.container}>
      <TopRecurrencesView keywords={topKeywords} emotions={topEmotions} />

      <View style={styles.upgradeCard}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.upgradeTitle}>Full Insights — Premium</Text>
        <Text style={styles.upgradeText}>
          See complete charts with all recurring symbols and emotions, with 30d / 90d / all-time views.
        </Text>
        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={() => router.push('/(main)/paywall')}
          accessibilityRole="button"
        >
          <Text style={styles.upgradeButtonText}>View Premium Plans</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a', padding: spacing.md, gap: spacing.lg },
  upgradeCard: {
    backgroundColor: '#1a1a2e', borderRadius: 12,
    padding: spacing.lg, alignItems: 'center', gap: spacing.sm,
  },
  lockIcon: { fontSize: 32 },
  upgradeTitle: { fontSize: 16, color: '#fff', fontWeight: '700' },
  upgradeText: { fontSize: 13, color: '#aaa', textAlign: 'center' },
  upgradeButton: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: 8,
  },
  upgradeButtonText: { color: '#fff', fontWeight: '600' },
});
