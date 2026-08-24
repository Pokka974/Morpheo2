import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import type { Entitlement } from '@services/entitlement/EntitlementService';
import { colors, glow, gradients, radius, sizes, spacing, typography } from '@theme/tokens';

/**
 * The upgrade link sits on one line of metadata, so it cannot be 44px tall without
 * pushing the card open. Hit slop buys the rest of the target instead.
 */
const UPGRADE_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

interface Props {
  email: string | null;
  dreamCount: number;
  /** When the account was opened — drives the "N dreams · since March" line. */
  since: Date | null;
  entitlement: Entitlement | null;
  onUpgrade: () => void;
}

/**
 * The head of the Settings screen: who you are, and what you have left.
 *
 * It replaces the generic "Subscription — Free" row. The quota was previously a value
 * on a list row, which said nothing about how close to the limit you were; here the
 * meter carries it, and the amber in the meter and the tier badge is the only amber on
 * the screen — the design reserves the hue for the positive end of a scale, never for
 * the destructive rows further down.
 */
export function ProfileCard({ email, dreamCount, since, entitlement, onUpgrade }: Props) {
  const { t, i18n } = useTranslation();

  const isPremium = entitlement?.subscriptionTier === 'premium';
  const limit = entitlement?.monthlyInterpretationLimit ?? null;
  const used = entitlement?.interpretationsUsedThisMonth ?? 0;
  const remaining = limit === null ? null : Math.max(limit - used, 0);
  // An unlimited tier has no meter to draw: a bar that is always full reads as a
  // warning rather than as "you have everything".
  const ratio = limit && limit > 0 ? Math.min(used / limit, 1) : 0;

  return (
    <LinearGradient
      colors={[...gradients.mystic.colors]}
      locations={[...gradients.mystic.locations]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.identity}>
        <LinearGradient
          colors={[...gradients.avatar.colors]}
          locations={[...gradients.avatar.locations]}
          start={{ x: 0.38, y: 0.32 }}
          end={{ x: 1, y: 1 }}
          style={[styles.avatar, glow.soft]}
        />
        <View style={styles.identityCopy}>
          <Text style={styles.email} numberOfLines={1}>
            {email ?? t('settings.accountNoEmail')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {since
              ? t('settings.profileMeta', {
                  count: dreamCount,
                  since: since.toLocaleDateString(i18n.language, {
                    month: 'long',
                    year: 'numeric',
                  }),
                })
              : t('settings.profileMetaNoDate', { count: dreamCount })}
          </Text>
        </View>
        <View style={[styles.badge, isPremium ? styles.badgePremium : styles.badgeFree]}>
          <Text style={[styles.badgeLabel, isPremium ? styles.badgeLabelPremium : null]}>
            {isPremium ? t('settings.tierPremium') : t('settings.tierFree')}
          </Text>
        </View>
      </View>

      {limit === null ? (
        <Text style={styles.quotaUnlimited}>{t('settings.quotaUnlimited')}</Text>
      ) : (
        <View style={styles.quota}>
          <View style={styles.quotaHeader}>
            <Text style={styles.quotaLabel}>
              {t('settings.quotaRemaining', { count: remaining ?? 0 })}
            </Text>
            <Text style={styles.quotaCount}>{t('settings.quotaFraction', { used, limit })}</Text>
          </View>
          {/*
            The meter is decorative: the line above it already states the remainder and
            the fraction in words, so exposing the bar too would make a screen reader
            announce the same quota twice.
          */}
          <View style={styles.meterTrack} testID="quota-meter" accessible={false}>
            <LinearGradient
              colors={[...gradients.meter.colors]}
              locations={[...gradients.meter.locations]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.meterFill, { width: `${ratio * 100}%` }]}
            />
          </View>
          <View style={styles.quotaFooter}>
            <Text style={styles.quotaFooterText} numberOfLines={1}>
              {entitlement
                ? t('settings.quotaResets', {
                    date: entitlement.resetDate.toLocaleDateString(i18n.language, {
                      day: 'numeric',
                      month: 'long',
                    }),
                  })
                : ''}
            </Text>
            <Pressable
              onPress={onUpgrade}
              accessibilityRole="button"
              accessibilityLabel={t('settings.goPremium')}
              hitSlop={UPGRADE_HIT_SLOP}
            >
              <Text style={styles.upgradeLink}>{t('settings.goPremium')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderMystic,
    gap: 14,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radius.full,
  },
  identityCopy: {
    flex: 1,
    gap: 3,
  },
  email: {
    ...typography.cardTitle,
    fontFamily: typography.chip.fontFamily,
    fontSize: 15,
    lineHeight: 20,
  },
  meta: {
    ...typography.meta,
    fontSize: 12,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  badgeFree: {
    backgroundColor: colors.background,
    borderColor: colors.highlightBorder,
  },
  badgePremium: {
    backgroundColor: colors.background,
    borderColor: colors.borderMystic,
  },
  badgeLabel: {
    ...typography.overline,
    color: colors.highlight,
  },
  badgeLabelPremium: {
    color: colors.accentText,
  },
  quota: {
    gap: 7,
  },
  quotaHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quotaLabel: {
    ...typography.meta,
    flex: 1,
    color: colors.textSecondary,
  },
  quotaCount: {
    ...typography.counter,
  },
  meterTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  quotaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quotaFooterText: {
    ...typography.meta,
    flex: 1,
    fontSize: 12,
  },
  quotaUnlimited: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  upgradeLink: {
    ...typography.chip,
    color: colors.accentText,
  },
});
