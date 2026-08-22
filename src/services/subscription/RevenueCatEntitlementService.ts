import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { supabase } from '../../supabase/client';
import type { EntitlementService, Entitlement } from '../entitlement/EntitlementService';

export class RevenueCatEntitlementService implements EntitlementService {
  static configure(apiKey: string) {
    void Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
  }

  async fetchEntitlement(): Promise<Entitlement> {
    // Server-authoritative: always fetch from Supabase, never trust client SDK
    const { data, error }: { data: unknown; error: unknown } = await supabase
      .from('entitlements')
      .select('*')
      .single();

    if (error || !data) throw new Error('Failed to fetch entitlement');

    const e = data as Record<string, unknown>;
    const resetDate = new Date((e['reset_date'] as string) ?? Date.now());
    const nextMonth = new Date(resetDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);

    return {
      subscriptionTier: e['tier'] as 'free' | 'premium',
      interpretationsUsedThisMonth: e['interpretations_used_this_month'] as number,
      monthlyInterpretationLimit: e['monthly_interpretation_limit'] as number | null,
      imagesUsedThisMonth: e['image_generations_used_this_month'] as number,
      monthlyImageLimit: e['monthly_image_limit'] as number | null,
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
    return e.imagesUsedThisMonth < e.monthlyImageLimit;
  }

  async isPremium(): Promise<boolean> {
    // Server-authoritative check: tampered client SDK state cannot affect this
    const e = await this.fetchEntitlement();
    return e.subscriptionTier === 'premium';
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
