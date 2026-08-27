import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useServices } from '@services/useServices';
import { Button } from '@shared/components/Button';
import { Card } from '@shared/components/Card';
import { CheckIcon } from '@shared/components/icons';
import { colors, fontSize, radius, spacing, typography } from '@theme/tokens';

/**
 * The two tiers, as i18n keys rather than strings. The numbers in the copy
 * (3 interpretations, 1 image + the welcome one) are the free-tier defaults set by
 * migration 018 — if those defaults ever move, these keys move with them.
 */
const FREE_FEATURE_KEYS = [
  'paywall.freeInterpretations',
  'paywall.freeImages',
  'paywall.freeJournal',
  'paywall.freeInsights',
] as const;

const PREMIUM_FEATURE_KEYS = [
  'paywall.premiumInterpretations',
  'paywall.premiumImages',
  'paywall.premiumInsights',
  'paywall.premiumRecurrence',
] as const;

const CHECK_SIZE = 16;

export default function PaywallScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { entitlement } = useServices();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    entitlement
      .getPremiumPriceString()
      .then(value => {
        if (active) setPrice(value);
      })
      .catch((err: unknown) => {
        // Non-blocking: the screen simply goes without the price line.
        console.error('Failed to load the premium price:', err);
      });
    return () => {
      active = false;
    };
  }, [entitlement]);

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
      <Text style={styles.title}>{t('paywall.title')}</Text>
      <Text style={styles.subtitle}>{t('paywall.subtitle')}</Text>

      <View style={styles.comparison}>
        <Card style={styles.tier}>
          <Text style={styles.tierLabel}>{t('paywall.tierFree')}</Text>
          {FREE_FEATURE_KEYS.map(key => (
            <View key={key} style={styles.featureRow}>
              <CheckIcon size={CHECK_SIZE} color={colors.textMuted} />
              <Text style={styles.featureText}>{t(key)}</Text>
            </View>
          ))}
        </Card>

        <Card variant="mystic" style={styles.tier}>
          <View style={styles.premiumHeader}>
            <Text style={styles.tierLabel}>{t('paywall.tierPremium')}</Text>
            {/*
              Only rendered once the store has answered. RevenueCat returns the price it
              will actually charge in the viewer's storefront, already localised, so there
              is nothing here to hardcode and nothing to go stale when the price changes.
            */}
            {price ? <Text style={styles.price}>{t('paywall.price', { price })}</Text> : null}
          </View>
          {PREMIUM_FEATURE_KEYS.map(key => (
            <View key={key} style={styles.featureRow}>
              <CheckIcon size={CHECK_SIZE} color={colors.accentText} />
              <Text style={[styles.featureText, styles.premiumFeatureText]}>{t(key)}</Text>
            </View>
          ))}
        </Card>
      </View>

      <Button
        label={t('paywall.cta')}
        onPress={() => {
          void handlePurchase();
        }}
        loading={isPurchasing}
        fullWidth
        testID="paywall-purchase"
      />

      <Button label={t('paywall.later')} onPress={() => router.back()} variant="ghost" fullWidth />

      <Text style={styles.legal}>{t('paywall.legal')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.screenTitle, textAlign: 'center' },
  subtitle: { ...typography.meta, textAlign: 'center', marginBottom: spacing.xs },
  comparison: { gap: spacing.md },
  tier: { gap: spacing.sm, borderRadius: radius.panel },
  tierLabel: { ...typography.cardTitle },
  premiumHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  price: { ...typography.meta, color: colors.highlight },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featureText: { ...typography.meta, flex: 1 },
  premiumFeatureText: { color: colors.textSecondary },
  legal: { ...typography.meta, fontSize: fontSize.xs, textAlign: 'center' },
});
