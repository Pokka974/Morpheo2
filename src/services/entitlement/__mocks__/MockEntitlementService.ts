import type { EntitlementService, Entitlement } from '../EntitlementService';

export type MockMode = 'free' | 'premium' | 'limit_exceeded' | 'premium_required';

const FREE_ENTITLEMENT: Entitlement = {
  subscriptionTier: 'free',
  interpretationsUsedThisMonth: 0,
  monthlyInterpretationLimit: 3,
  imagesUsedThisMonth: 0,
  monthlyImageLimit: 1,
  bonusImageCredits: 1,
  resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  subscriptionExpiresAt: null,
};

export class MockEntitlementService implements EntitlementService {
  private mode: MockMode = 'free';

  configure(mode: MockMode) {
    this.mode = mode;
    return this;
  }

  async fetchEntitlement(): Promise<Entitlement> {
    if (this.mode === 'premium') {
      return {
        ...FREE_ENTITLEMENT,
        subscriptionTier: 'premium',
        monthlyInterpretationLimit: null,
        monthlyImageLimit: null,
      };
    }
    if (this.mode === 'limit_exceeded') {
      // Both quotas exhausted, welcome image included — otherwise a screen under test
      // could still generate an image while claiming to be at its limit.
      return {
        ...FREE_ENTITLEMENT,
        interpretationsUsedThisMonth: 3,
        imagesUsedThisMonth: 1,
        bonusImageCredits: 0,
      };
    }
    return FREE_ENTITLEMENT;
  }

  async canInterpret(): Promise<boolean> {
    return this.mode !== 'limit_exceeded';
  }

  async canGenerateImage(): Promise<boolean> {
    return this.mode !== 'limit_exceeded';
  }

  async isPremium(): Promise<boolean> {
    return this.mode === 'premium';
  }

  async getPremiumPriceString(): Promise<string | null> {
    return '7,99 €';
  }

  async purchasePremium(): Promise<{ success: boolean }> {
    return { success: true };
  }

  async manageSubscription(): Promise<void> {}
}
