export interface Entitlement {
  subscriptionTier: 'free' | 'premium';
  interpretationsUsedThisMonth: number;
  monthlyInterpretationLimit: number | null;
  imagesUsedThisMonth: number;
  monthlyImageLimit: number | null;
  /**
   * The one-time welcome image (migration 018): a lifetime credit, spent only once the
   * month's allowance is gone, and deliberately outside the monthly reset. It is what
   * lets a brand-new free account illustrate a dream on day one rather than waiting for
   * the 1st of the month.
   */
  bonusImageCredits: number;
  resetDate: Date;
  subscriptionExpiresAt: Date | null;
}

export interface PurchaseResult {
  /** The store accepted the purchase. */
  success: boolean;
  /**
   * The server row was observed reading `premium` before the wait budget ran out.
   *
   * Distinct from `success` because the two are decided by different systems: the store
   * settles the payment, then RevenueCat delivers a webhook out-of-band which is what
   * actually writes `entitlements`. A `success: true, confirmed: false` is the normal
   * shape of a slow webhook, not a failure — the purchase stands and the next
   * `fetchEntitlement()` will see it. Callers should not treat it as a refusal.
   */
  confirmed: boolean;
}

export interface EntitlementService {
  fetchEntitlement(): Promise<Entitlement>;
  /**
   * Binds the purchase provider's own user id to the Supabase user id.
   *
   * Without it RevenueCat mints an anonymous `$RCAnonymousID:…` and sends that as
   * `app_user_id`, which matches no row in `entitlements` or `profiles` — both key on a
   * uuid column — so a real purchase settles and the tables stay `free`. Called on every
   * session, restored or fresh, since the provider holds identity across app launches
   * independently of ours.
   */
  identify(userId: string): Promise<void>;
  /**
   * Releases that binding on sign-out, so the next account on this device does not
   * inherit the previous one's purchases.
   */
  resetIdentity(): Promise<void>;
  canInterpret(): Promise<boolean>;
  canGenerateImage(): Promise<boolean>;
  isPremium(): Promise<boolean>;
  /**
   * The premium subscription's price, already formatted and localised by the store
   * ("7,99 €", "$8.99"). `null` when no offering is configured or reachable — the paywall
   * omits the line rather than showing a price that may be wrong in the viewer's
   * storefront.
   */
  getPremiumPriceString(): Promise<string | null>;
  purchasePremium(): Promise<PurchaseResult>;
  manageSubscription(): Promise<void>;
}
