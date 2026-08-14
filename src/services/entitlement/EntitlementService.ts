export interface Entitlement {
  subscriptionTier: 'free' | 'premium';
  interpretationsUsedThisMonth: number;
  monthlyInterpretationLimit: number | null;
  imagesUsedThisMonth: number;
  monthlyImageLimit: number | null;
  resetDate: Date;
  subscriptionExpiresAt: Date | null;
}

export interface EntitlementService {
  fetchEntitlement(): Promise<Entitlement>;
  canInterpret(): Promise<boolean>;
  canGenerateImage(): Promise<boolean>;
  isPremium(): Promise<boolean>;
  purchasePremium(): Promise<{ success: boolean }>;
  manageSubscription(): Promise<void>;
}
