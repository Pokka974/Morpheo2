import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { useServices } from '@services/useServices';
import type { Entitlement } from '@services/entitlement/EntitlementService';
import { colors, gradients, radius, spacing, typography } from '@theme/tokens';

const DEFAULT_FREE_LIMIT = 5;

/**
 * The free-tier quota nudge from the design's "États" sheet: an amber-bordered card
 * with a progress bar, shown only to free subscribers. Renders nothing for premium
 * (no quota to show) and nothing until the entitlement resolves, so it never flashes
 * a wrong count.
 */
export function UsageIndicator() {
  const { t, i18n } = useTranslation();
  const { entitlement } = useServices();
  const [data, setData] = useState<Entitlement | null>(null);

  useEffect(() => {
    entitlement
      .fetchEntitlement()
      .then(setData)
      .catch((err: unknown) => {
        // Non-blocking: the indicator stays hidden rather than breaking the screen.
        console.error('Failed to load usage entitlement:', err);
      });
  }, [entitlement]);

  if (!data || data.subscriptionTier === 'premium') return null;

  const limit = data.monthlyInterpretationLimit ?? DEFAULT_FREE_LIMIT;
  const used = data.interpretationsUsedThisMonth;
  const remaining = Math.max(limit - used, 0);
  const progress = limit > 0 ? Math.min(used / limit, 1) : 1;
  const resetDate = data.resetDate.toLocaleDateString(i18n.language, {
    month: 'long',
    day: 'numeric',
  });

  return (
    <LinearGradient
      colors={[...gradients.premiumQuota.colors]}
      locations={[...gradients.premiumQuota.locations]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.badgeRow}>
        <View style={styles.dot} />
        <Text style={styles.badge}>{t('common.premium')}</Text>
      </View>

      <Text style={styles.remaining}>{t('states.quotaRemaining', { count: remaining })}</Text>

      <View style={styles.track}>
        <View style={[styles.fillClip, { width: `${progress * 100}%` }]}>
          <LinearGradient
            colors={[...gradients.meter.colors]}
            locations={[...gradients.meter.locations]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fill}
          />
        </View>
      </View>

      <Text style={styles.reset}>{t('states.quotaUsed', { used, limit, date: resetDate })}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md + 2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.highlightBorder,
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.highlight,
  },
  badge: {
    ...typography.overline,
    color: colors.highlight,
  },
  remaining: {
    ...typography.cardTitle,
    fontSize: 15,
  },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  fillClip: {
    height: '100%',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  reset: {
    ...typography.meta,
    fontSize: 11,
  },
});
