import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useServices } from '@services/useServices';
import { colors, spacing } from '@theme/tokens';

const FREE_FEATURES = [
  '5 AI interpretations per month',
  '3 AI images per month',
  'Basic journal & search',
  'Top 3 recurring themes',
];

const PREMIUM_FEATURES = [
  'Unlimited AI interpretations',
  'Unlimited AI images',
  'Full recurrence analytics',
  'All-time insights dashboard',
];

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
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
        onPress={() => {
          void handlePurchase();
        }}
        disabled={isPurchasing}
        accessibilityRole="button"
      >
        {isPurchasing ? (
          <ActivityIndicator color={colors.textPrimary} />
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, color: colors.textPrimary, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  comparison: { gap: spacing.md },
  tier: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  premiumTier: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  tierLabel: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureCheck: { color: colors.textMuted, fontSize: 14, width: 16 },
  featureText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  premiumCheck: { color: colors.accent, fontSize: 14, width: 16 },
  premiumFeatureText: { color: colors.textSecondary },
  purchaseButton: {
    backgroundColor: colors.accent,
    padding: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  purchaseButtonDisabled: { opacity: 0.6 },
  purchaseButtonText: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  laterButton: { alignItems: 'center', padding: spacing.sm },
  laterText: { color: colors.textMuted, fontSize: 14 },
  legal: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
