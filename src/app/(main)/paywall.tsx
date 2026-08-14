import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useServices } from '@services/useServices';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

const FREE_FEATURES = [
  '5 AI interpretations per month',
  '3 AI images per month',
  'Basic journal & search',
  'Top 3 recurring themes',
];

const PREMIUM_FEATURES = [
  'Unlimited AI interpretations',
  'Unlimited AI images',
  'Video dream illustration',
  'Full recurrence analytics',
  'All-time insights dashboard',
];

export default function PaywallScreen() {
  const router = useRouter();
  const { entitlement } = useServices();
  const [isPurchasing, setIsPurchasing] = useState(false);

  const handlePurchase = async () => {
    setIsPurchasing(true);
    try {
      const { success } = await entitlement.purchasePremium();
      if (success) router.back();
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Unlock Morpheo Premium</Text>
      <Text style={styles.subtitle}>Everything you need for deeper dream insights</Text>

      <View style={styles.comparison}>
        <View style={styles.tier}>
          <Text style={styles.tierLabel}>Free</Text>
          {FREE_FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.featureCheck}>✓</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.tier, styles.premiumTier]}>
          <Text style={styles.tierLabel}>Premium ⭐</Text>
          {PREMIUM_FEATURES.map(f => (
            <View key={f} style={styles.featureRow}>
              <Text style={styles.premiumCheck}>✓</Text>
              <Text style={[styles.featureText, styles.premiumFeatureText]}>{f}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.purchaseButton, isPurchasing && styles.purchaseButtonDisabled]}
        onPress={handlePurchase}
        disabled={isPurchasing}
        accessibilityRole="button"
      >
        {isPurchasing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.purchaseButtonText}>Start Premium</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.laterButton}
        onPress={() => router.back()}
        accessibilityRole="button"
      >
        <Text style={styles.laterText}>Maybe Later</Text>
      </TouchableOpacity>

      <Text style={styles.legal}>
        Subscription auto-renews. Cancel anytime in App Store / Play Store settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, color: '#fff', fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#aaa', textAlign: 'center' },
  comparison: { gap: spacing.md },
  tier: {
    backgroundColor: '#1a1a2e', borderRadius: 12,
    padding: spacing.md, gap: spacing.sm,
  },
  premiumTier: {
    borderWidth: 2, borderColor: colors.primary,
  },
  tierLabel: { fontSize: 16, color: '#fff', fontWeight: '700', marginBottom: spacing.xs },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureCheck: { color: '#666', fontSize: 14, width: 16 },
  featureText: { color: '#aaa', fontSize: 13, flex: 1 },
  premiumCheck: { color: colors.primary, fontSize: 14, width: 16 },
  premiumFeatureText: { color: '#ddd' },
  purchaseButton: {
    backgroundColor: colors.primary, padding: spacing.md,
    borderRadius: 12, alignItems: 'center',
  },
  purchaseButtonDisabled: { opacity: 0.6 },
  purchaseButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  laterButton: { alignItems: 'center', padding: spacing.sm },
  laterText: { color: '#666', fontSize: 14 },
  legal: { fontSize: 11, color: '#444', textAlign: 'center' },
});
