import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '../../supabase/client';
import type {
  EntitlementService,
  Entitlement,
  PurchaseResult,
} from '../entitlement/EntitlementService';

/**
 * RevenueCat issues a public SDK key per *app*, not per project — the App Store app
 * yields an `appl_` key and the Play Store app a `goog_` one — so one shared variable
 * could only ever be correct on one of the two platforms.
 */
const PLATFORM_KEY_VARS = {
  ios: 'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
  android: 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
} as const;

/**
 * The public keys `Purchases.configure()` accepts: one per store, plus `test_` — the
 * project-wide Test Store key RevenueCat issues before any store app is configured.
 * The Test Store key is the same on both platforms, so until real app configurations
 * exist, both platform variables below hold it.
 */
const PUBLIC_SDK_KEY_PREFIXES = ['appl_', 'goog_', 'amzn_', 'mkpl_', 'rcb_', 'test_'];

/**
 * A RevenueCat *secret* key. `EXPO_PUBLIC_*` values are inlined into the JS bundle at
 * build time, so one of these reaching configure() means it has also been compiled
 * into an extractable form in the binary — refuse it rather than ship it.
 */
const SECRET_KEY_PREFIX = 'sk_';

/**
 * How long to wait, and how, for the purchase webhook to land the tier change.
 *
 * RevenueCat delivers `INITIAL_PURCHASE` out-of-band, so the row is still `free` at the
 * instant `purchasePackage()` resolves. Backs off rather than hammering: the webhook
 * usually lands within a second or two, and each attempt is a round trip to PostgREST.
 * Totals ~9.75s of waiting across six reads.
 */
const CONFIRMATION_BACKOFF_MS = [250, 500, 1000, 2000, 3000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RevenueCatEntitlementService implements EntitlementService {
  /**
   * Whether `configure()` handed the SDK a key. Every `Purchases.*` call below is a
   * no-op without one — the native singleton does not exist, and calling into it throws
   * rather than failing soft. A build with no key is a supported state (entitlement
   * *reads* come from Supabase and stay correct), so this must not become an exception.
   */
  private static configured = false;

  /**
   * Hands this platform's public SDK key to the SDK. Returns whether it was configured,
   * so a caller can tell "no key on this build" from "configured and ready".
   *
   * The key is read here rather than passed in: which variable holds it, and what a
   * valid one looks like, are RevenueCat's concerns and belong behind its adapter.
   */
  static configure(): boolean {
    const envVar = Platform.select(PLATFORM_KEY_VARS);
    const apiKey: string | undefined = envVar
      ? (process.env[envVar] as string | undefined)
      : undefined;

    if (!apiKey) {
      // Not fatal — entitlement *reads* come from Supabase and stay correct. Only the
      // paywall is dead, and silence is what let that go unnoticed for a release cycle.
      console.warn(
        `RevenueCat is not configured: ${envVar ?? `no key variable for platform ${Platform.OS}`} is unset. ` +
          'Purchases and the premium price will be unavailable.'
      );
      return false;
    }

    if (apiKey.startsWith(SECRET_KEY_PREFIX)) {
      console.error(
        `${envVar} holds a RevenueCat SECRET key ("${SECRET_KEY_PREFIX}…"), which the SDK rejects ` +
          'and which is compiled into the app bundle. Rotate it, then set the app-specific ' +
          'public SDK key from Project Settings → Apps → [app] → App-specific key.'
      );
      return false;
    }

    if (!PUBLIC_SDK_KEY_PREFIXES.some(prefix => apiKey.startsWith(prefix))) {
      // Warn rather than refuse: RevenueCat can mint a prefix this list has not caught
      // up with, and the SDK is the real authority on what it accepts.
      console.warn(
        `${envVar} does not look like an app-specific public SDK key ` +
          `(expected one of ${PUBLIC_SDK_KEY_PREFIXES.join(', ')}). Configuring anyway.`
      );
    }

    void Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey });
    RevenueCatEntitlementService.configured = true;
    return true;
  }

  async identify(userId: string): Promise<void> {
    if (!RevenueCatEntitlementService.configured) {
      console.warn(`RevenueCat is not configured; ${userId} was not identified to it.`);
      return;
    }
    try {
      await Purchases.logIn(userId);
    } catch (err) {
      // Non-fatal by design: this runs on the auth path, and a purchase provider being
      // unreachable must not stop a user signing in. The cost is that a purchase made in
      // this session would arrive anonymous — the webhook logs exactly that case.
      console.error('Identifying the user to RevenueCat failed:', err);
    }
  }

  async resetIdentity(): Promise<void> {
    if (!RevenueCatEntitlementService.configured) return;
    try {
      await Purchases.logOut();
    } catch (err) {
      // `logOut()` throws when the current id is already anonymous — which is the state
      // after a sign-out that never reached `identify()`, so it is expected, not a fault.
      console.error('Resetting the RevenueCat identity failed:', err);
    }
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

  async purchasePremium(): Promise<PurchaseResult> {
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages[0];
      if (!pkg) return { success: false, confirmed: false };
      await Purchases.purchasePackage(pkg);
      // The store has settled the payment. The server row has not moved yet: RevenueCat
      // writes it through the webhook, which arrives out-of-band, so reading once here
      // returns the pre-purchase `free` and the paywall looks like it failed.
      return { success: true, confirmed: await this.waitForPremium() };
    } catch {
      return { success: false, confirmed: false };
    }
  }

  /**
   * Polls the server row until it reads `premium`, or the backoff budget runs out.
   *
   * Deliberately re-reads Supabase rather than trusting `CustomerInfo` from the purchase
   * result: `entitlements.subscription_tier` is what every gate in the app and every
   * Edge Function checks, so "the purchase worked" has to mean *that* column moved.
   * Returns false rather than throwing — the purchase itself already succeeded.
   */
  private async waitForPremium(): Promise<boolean> {
    for (const waitMs of CONFIRMATION_BACKOFF_MS) {
      try {
        const e = await this.fetchEntitlement();
        if (e.subscriptionTier === 'premium') return true;
      } catch (err) {
        // A transient read failure is not evidence the purchase failed; keep waiting.
        console.error('Reading the entitlement while confirming a purchase failed:', err);
      }
      await sleep(waitMs);
    }
    console.warn(
      'A purchase succeeded but the entitlement row still reads free after ' +
        `${CONFIRMATION_BACKOFF_MS.reduce((a, b) => a + b, 0)}ms. ` +
        'The RevenueCat webhook has not landed yet; the next fetch should see it.'
    );
    return false;
  }

  async manageSubscription(): Promise<void> {
    await Purchases.showManageSubscriptions();
  }
}
