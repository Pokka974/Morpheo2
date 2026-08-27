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

export interface EntitlementService {
  fetchEntitlement(): Promise<Entitlement>;
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
  purchasePremium(): Promise<{ success: boolean }>;
  manageSubscription(): Promise<void>;
}
