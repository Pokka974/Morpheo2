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

interface QuotaMeterProps {
  /** Already-interpolated "3 interpretations left" / "1 image left". */
  label: string;
  used: number;
  limit: number;
  testID: string;
}

/**
 * One quota: the remainder in words, the raw fraction, and a bar.
 *
 * The bar is decorative — the line above it already states both the remainder and the
 * fraction, so exposing it would make a screen reader announce the same quota twice.
 */
function QuotaMeter({ label, used, limit, testID }: QuotaMeterProps) {
  const { t } = useTranslation();
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  // Usage can legitimately exceed the limit: `expire-subscriptions` drops a lapsed
  // subscriber to free without zeroing counters, so someone who used 40 interpretations
  // on premium lands on a limit of 3 mid-cycle. "40 / 3" reads as a rendering fault
  // rather than as "you are over" — the line beside it already says 0 left — so the
  // fraction reports the limit as reached and waits for the monthly reset.
  const shown = Math.min(used, limit);

  return (
    <View style={styles.meter}>
      <View style={styles.quotaHeader}>
        <Text style={styles.quotaLabel}>{label}</Text>
        <Text style={styles.quotaCount}>{t('settings.quotaFraction', { used: shown, limit })}</Text>
      </View>
      <View style={styles.meterTrack} testID={testID} accessible={false}>
        <LinearGradient
          colors={[...gradients.meter.colors]}
          locations={[...gradients.meter.locations]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.meterFill, { width: `${ratio * 100}%` }]}
        />
      </View>
    </View>
  );
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

  // Deliberately three-valued. A null entitlement means the fetch has not resolved — or
  // failed — and the card must not fill that in with "free": that is a paying account
  // being told it is on the free tier, which is exactly what a missing column on the
  // server looked like from inside the app. Unknown renders as nothing at all.
  const tier = entitlement?.subscriptionTier ?? null;
  const isPremium = tier === 'premium';

  const limit = entitlement?.monthlyInterpretationLimit ?? null;
  const used = entitlement?.interpretationsUsedThisMonth ?? 0;
  const remaining = limit === null ? null : Math.max(limit - used, 0);

  // Images are the scarcer quota since the repricing — one a month against three
  // interpretations — so the card carries a second meter rather than leaving the number
  // discoverable only by hitting the limit.
  const imageLimit = entitlement?.monthlyImageLimit ?? null;
  const imagesUsed = entitlement?.imagesUsedThisMonth ?? 0;
  const imagesRemaining = imageLimit === null ? null : Math.max(imageLimit - imagesUsed, 0);

  // The one-time welcome image sits outside the monthly cycle, so it is stated on its own
  // line rather than folded into the meter above it: adding it to the fraction would draw
  // a bar that refills once and never again, and hiding it would leave the user unaware
  // of a credit they are holding.
  const welcomeImages = entitlement?.bonusImageCredits ?? 0;

  // An unlimited tier has no meter to draw: a bar that is always full reads as a
  // warning rather than as "you have everything". An unknown tier has nothing to draw
  // either — "Unlimited" is as wrong a guess as "Free" when the fetch has not landed.
  const hasQuota = tier !== null && !isPremium && (limit !== null || imageLimit !== null);
  const isUnlimited = tier !== null && !hasQuota;

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
        {tier === null ? null : (
          <View style={[styles.badge, isPremium ? styles.badgePremium : styles.badgeFree]}>
            <Text style={[styles.badgeLabel, isPremium ? styles.badgeLabelPremium : null]}>
              {isPremium ? t('settings.tierPremium') : t('settings.tierFree')}
            </Text>
          </View>
        )}
      </View>

      {hasQuota ? (
        <View style={styles.quota}>
          {limit !== null ? (
            <QuotaMeter
              label={t('settings.quotaRemaining', { count: remaining ?? 0 })}
              used={used}
              limit={limit}
              testID="quota-meter"
            />
          ) : null}

          {imageLimit !== null ? (
            <QuotaMeter
              label={t('settings.quotaImagesRemaining', { count: imagesRemaining ?? 0 })}
              used={imagesUsed}
              limit={imageLimit}
              testID="image-quota-meter"
            />
          ) : null}

          {welcomeImages > 0 ? (
            <Text style={styles.welcomeCredit}>
              {t('settings.quotaWelcomeImage', { count: welcomeImages })}
            </Text>
          ) : null}

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
      ) : isUnlimited ? (
        <Text style={styles.quotaUnlimited}>{t('settings.quotaUnlimited')}</Text>
      ) : null}
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
    gap: 10,
  },
  /** One label-fraction-bar group. Tighter than the gap between two of them. */
  meter: {
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
  /**
   * Amber, because this is the positive end of a scale — a credit the account holds —
   * which is exactly what the design reserves the hue for, alongside the meter fill and
   * the free-tier badge.
   */
  welcomeCredit: {
    ...typography.meta,
    fontSize: 12,
    color: colors.highlight,
  },
  upgradeLink: {
    ...typography.chip,
    color: colors.accentText,
  },
});
