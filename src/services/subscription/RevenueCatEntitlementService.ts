import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { supabase } from '../../supabase/client';
import type { EntitlementService, Entitlement } from '../entitlement/EntitlementService';

export class RevenueCatEntitlementService implements EntitlementService {
  static configure(apiKey: string) {
    void Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
  }

  async fetchEntitlement(): Promise<Entitlement> {
    // Server-authoritative: always fetch from Supabase, never trust client SDK.
    // Columns are listed explicitly rather than '*' so the schema-contract test can
    // verify them against the migrations — a '*' select hides column-name drift until
    // it surfaces as an undefined field at runtime.
    const { data, error }: { data: unknown; error: unknown } = await supabase
      .from('entitlements')
      .select(
        'subscription_tier, interpretations_used_this_month, monthly_interpretation_limit, images_used_this_month, monthly_image_limit, bonus_image_credits, reset_date, subscription_expires_at'
      )
      .single();

    if (error || !data) throw new Error('Failed to fetch entitlement');

    const e = data as Record<string, unknown>;
    const resetDate = new Date((e['reset_date'] as string) ?? Date.now());
    const nextMonth = new Date(resetDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);

    return {
      subscriptionTier: e['subscription_tier'] as 'free' | 'premium',
      interpretationsUsedThisMonth: e['interpretations_used_this_month'] as number,
      monthlyInterpretationLimit: e['monthly_interpretation_limit'] as number | null,
      imagesUsedThisMonth: e['images_used_this_month'] as number,
      monthlyImageLimit: e['monthly_image_limit'] as number | null,
      // Defaults to 0 rather than 1: a row read before migration 018 has no such column,
      // and the safe reading of "unknown" is that the welcome image is already spent —
      // the server gate is the one that decides either way.
      bonusImageCredits: (e['bonus_image_credits'] as number | null) ?? 0,
      resetDate,
      subscriptionExpiresAt: e['subscription_expires_at']
        ? new Date(e['subscription_expires_at'] as string)
        : null,
    };
  }

  async canInterpret(): Promise<boolean> {
    const e = await this.fetchEntitlement();
    if (e.subscriptionTier === 'premium') return true;
    if (e.monthlyInterpretationLimit === null) return true;
    return e.interpretationsUsedThisMonth < e.monthlyInterpretationLimit;
  }

  async canGenerateImage(): Promise<boolean> {
    const e = await this.fetchEntitlement();
    if (e.subscriptionTier === 'premium') return true;
    if (e.monthlyImageLimit === null) return true;
    // Mirrors consume_image_credit (019): the month's allowance first, then the one-time
    // welcome image. A free account that has spent its monthly image but still holds the
    // welcome credit can generate — this is the only reason a new user is not paywalled
    // on their first dream.
    return e.imagesUsedThisMonth < e.monthlyImageLimit || e.bonusImageCredits > 0;
  }

  async isPremium(): Promise<boolean> {
    // Server-authoritative check: tampered client SDK state cannot affect this
    const e = await this.fetchEntitlement();
    return e.subscriptionTier === 'premium';
  }

  async getPremiumPriceString(): Promise<string | null> {
    // `priceString` is the store's own localised rendering of the price it will actually
    // charge in this storefront. Hardcoding "7,99 €" would be a lie everywhere outside
    // the eurozone, and stale the first time the price is changed in the dashboard.
    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current?.availablePackages[0]?.product.priceString ?? null;
    } catch (err) {
      console.error('Failed to read the premium price from RevenueCat:', err);
      return null;
    }
  }

  async purchasePremium(): Promise<{ success: boolean }> {
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages[0];
      if (!pkg) return { success: false };
      await Purchases.purchasePackage(pkg);
      // Re-fetch entitlement after purchase (webhook updates server, then we sync)
      await this.fetchEntitlement();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async manageSubscription(): Promise<void> {
    await Purchases.showManageSubscriptions();
  }
}
