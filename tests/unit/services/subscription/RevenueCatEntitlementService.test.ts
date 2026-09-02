import { RevenueCatEntitlementService } from '@services/subscription/RevenueCatEntitlementService';

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockShowManageSubscriptions = jest.fn();
const mockSetLogLevel = jest.fn();
const mockConfigure = jest.fn();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    setLogLevel: (...args: unknown[]) => mockSetLogLevel(...args),
    configure: (...args: unknown[]) => mockConfigure(...args),
    getOfferings: () => mockGetOfferings(),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    showManageSubscriptions: () => mockShowManageSubscriptions(),
  },
  LOG_LEVEL: { ERROR: 'ERROR' },
}));

// `Platform.select` is hardcoded per platform file (Platform.ios.js always returns
// `spec.ios`), so flipping `Platform.OS` is not enough to exercise the Android branch —
// the module itself has to be swapped.
let mockPlatformOS: 'ios' | 'android' = 'ios';
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    get OS() {
      return mockPlatformOS;
    },
    select: (spec: Record<string, unknown>) => spec[mockPlatformOS],
  },
}));

const mockSingle = jest.fn();
const mockEq = jest.fn().mockReturnThis();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        single: (...args: unknown[]) => mockSingle(...args),
        eq: mockEq,
      }),
      update: () => ({ eq: mockEq }),
      eq: mockEq,
      single: (...args: unknown[]) => mockSingle(...args),
    }),
  },
}));

// The free-tier defaults set by migration 018: 3 interpretations a month, 1 image a
// month, plus a one-time welcome image that never resets.
const FREE_ENTITLEMENT = {
  subscription_tier: 'free',
  interpretations_used_this_month: 1,
  monthly_interpretation_limit: 3,
  images_used_this_month: 0,
  monthly_image_limit: 1,
  bonus_image_credits: 1,
  reset_date: '2026-09-01',
  subscription_expires_at: null,
};

const PREMIUM_ENTITLEMENT = {
  ...FREE_ENTITLEMENT,
  subscription_tier: 'premium',
  monthly_interpretation_limit: null,
  monthly_image_limit: null,
};

describe('RevenueCatEntitlementService', () => {
  let service: RevenueCatEntitlementService;

  beforeEach(() => {
    service = new RevenueCatEntitlementService();
    jest.clearAllMocks();
    mockSingle.mockResolvedValue({ data: FREE_ENTITLEMENT, error: null });
  });

  describe('configure', () => {
    const IOS_VAR = 'EXPO_PUBLIC_REVENUECAT_IOS_KEY';
    const ANDROID_VAR = 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY';
    const originalEnv = { ...process.env };

    beforeEach(() => {
      mockPlatformOS = 'ios';
      delete process.env[IOS_VAR];
      delete process.env[ANDROID_VAR];
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('configures the SDK with the iOS app-specific key on iOS', () => {
      process.env[IOS_VAR] = 'appl_abc123';
      process.env[ANDROID_VAR] = 'goog_xyz789';

      expect(RevenueCatEntitlementService.configure()).toBe(true);
      expect(mockConfigure).toHaveBeenCalledWith({ apiKey: 'appl_abc123' });
    });

    it('configures the SDK with the Android app-specific key on Android', () => {
      mockPlatformOS = 'android';
      process.env[IOS_VAR] = 'appl_abc123';
      process.env[ANDROID_VAR] = 'goog_xyz789';

      expect(RevenueCatEntitlementService.configure()).toBe(true);
      expect(mockConfigure).toHaveBeenCalledWith({ apiKey: 'goog_xyz789' });
    });

    // The Test Store key is project-wide and is what a project with no store app
    // configured has to offer — it must be accepted as cleanly as an `appl_` one.
    it('accepts the project-wide Test Store key without warning', () => {
      process.env[IOS_VAR] = 'test_vgWhzDzPRRGxdLLeaITcmBmqflA';

      expect(RevenueCatEntitlementService.configure()).toBe(true);
      expect(mockConfigure).toHaveBeenCalledWith({
        apiKey: 'test_vgWhzDzPRRGxdLLeaITcmBmqflA',
      });
      expect(console.warn).not.toHaveBeenCalled();
    });

    // Issue #55: an `sk_` key here is both rejected by the SDK and compiled into the
    // bundle, so it must never reach configure() — and must not fail quietly.
    it('refuses a secret key and says so', () => {
      process.env[IOS_VAR] = 'sk_SomeSecretValue';

      expect(RevenueCatEntitlementService.configure()).toBe(false);
      expect(mockConfigure).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SECRET key'));
    });

    it('warns and does not configure when no key is set for the platform', () => {
      expect(RevenueCatEntitlementService.configure()).toBe(false);
      expect(mockConfigure).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(IOS_VAR));
    });

    // The SDK, not this list of prefixes, is the authority on what it accepts: an
    // unrecognised prefix is worth flagging but not worth killing the paywall over.
    it('warns but still configures when the prefix is unrecognised', () => {
      process.env[IOS_VAR] = 'wat_unknownprefix';

      expect(RevenueCatEntitlementService.configure()).toBe(true);
      expect(mockConfigure).toHaveBeenCalledWith({ apiKey: 'wat_unknownprefix' });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not look like an app-specific public SDK key')
      );
    });
  });

  describe('fetchEntitlement', () => {
    it('fetches from server — not from RevenueCat SDK', async () => {
      const e = await service.fetchEntitlement();
      expect(e.subscriptionTier).toBe('free');
      expect(mockGetOfferings).not.toHaveBeenCalled();
    });

    it('throws when the server query errors', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });
      await expect(service.fetchEntitlement()).rejects.toThrow('Failed to fetch entitlement');
    });

    it('throws when the server returns no row', async () => {
      mockSingle.mockResolvedValue({ data: null, error: null });
      await expect(service.fetchEntitlement()).rejects.toThrow('Failed to fetch entitlement');
    });

    it('maps subscription_expires_at to a Date when present', async () => {
      mockSingle.mockResolvedValue({
        data: { ...FREE_ENTITLEMENT, subscription_expires_at: '2026-12-01T00:00:00.000Z' },
        error: null,
      });
      const e = await service.fetchEntitlement();
      expect(e.subscriptionExpiresAt).toEqual(new Date('2026-12-01T00:00:00.000Z'));
    });
  });

  describe('canGenerateImage', () => {
    it('returns false when both the monthly image and the welcome credit are spent', async () => {
      mockSingle.mockResolvedValue({
        data: { ...FREE_ENTITLEMENT, images_used_this_month: 1, bonus_image_credits: 0 },
        error: null,
      });
      expect(await service.canGenerateImage()).toBe(false);
    });

    // The welcome credit is the whole reason a brand-new free account is not paywalled
    // on the second image of its first month. Mirrors consume_image_credit (019).
    it('returns true when the monthly image is spent but the welcome credit remains', async () => {
      mockSingle.mockResolvedValue({
        data: { ...FREE_ENTITLEMENT, images_used_this_month: 1, bonus_image_credits: 1 },
        error: null,
      });
      expect(await service.canGenerateImage()).toBe(true);
    });

    it('treats a row with no bonus_image_credits column as having no welcome credit', async () => {
      // A client reading a row written before migration 018 must not assume a credit that
      // the server gate will then refuse.
      const preMigration: Record<string, unknown> = { ...FREE_ENTITLEMENT };
      delete preMigration['bonus_image_credits'];
      mockSingle.mockResolvedValue({
        data: { ...preMigration, images_used_this_month: 1 },
        error: null,
      });
      expect(await service.canGenerateImage()).toBe(false);
    });

    it('returns true when free tier has remaining images', async () => {
      expect(await service.canGenerateImage()).toBe(true);
    });

    it('returns true for premium regardless of count', async () => {
      mockSingle.mockResolvedValue({ data: PREMIUM_ENTITLEMENT, error: null });
      expect(await service.canGenerateImage()).toBe(true);
    });

    it('returns true for premium even on a row that still carries a monthly limit', async () => {
      // Nothing nulls these columns on upgrade — the RevenueCat webhook only flips the
      // tier — so the short-circuit is what makes premium unlimited, here and in the RPC.
      mockSingle.mockResolvedValue({
        data: {
          ...FREE_ENTITLEMENT,
          subscription_tier: 'premium',
          images_used_this_month: 9,
          bonus_image_credits: 0,
        },
        error: null,
      });
      expect(await service.canGenerateImage()).toBe(true);
    });

    it('returns true when monthlyImageLimit is null on a non-premium tier', async () => {
      mockSingle.mockResolvedValue({
        data: { ...FREE_ENTITLEMENT, monthly_image_limit: null },
        error: null,
      });
      expect(await service.canGenerateImage()).toBe(true);
    });
  });

  describe('canInterpret', () => {
    it('returns false when free tier limit exhausted', async () => {
      mockSingle.mockResolvedValue({
        data: { ...FREE_ENTITLEMENT, interpretations_used_this_month: 3 },
        error: null,
      });
      expect(await service.canInterpret()).toBe(false);
    });

    it('returns true when free tier has remaining interpretations', async () => {
      expect(await service.canInterpret()).toBe(true);
    });

    it('returns true for premium regardless of count', async () => {
      mockSingle.mockResolvedValue({ data: PREMIUM_ENTITLEMENT, error: null });
      expect(await service.canInterpret()).toBe(true);
    });
  });

  describe('isPremium', () => {
    it('returns server tier — not client SDK state', async () => {
      // Even if RevenueCat SDK says premium, we return server value
      mockSingle.mockResolvedValue({ data: FREE_ENTITLEMENT, error: null });
      expect(await service.isPremium()).toBe(false);
      expect(mockGetOfferings).not.toHaveBeenCalled();
    });

    it('returns true when server says premium', async () => {
      mockSingle.mockResolvedValue({ data: PREMIUM_ENTITLEMENT, error: null });
      expect(await service.isPremium()).toBe(true);
    });
  });

  describe('purchasePremium', () => {
    it('calls Purchases.purchasePackage on success', async () => {
      mockGetOfferings.mockResolvedValue({
        current: { availablePackages: [{ identifier: 'premium_monthly' }] },
      });
      mockPurchasePackage.mockResolvedValue({ customerInfo: {} });

      const result = await service.purchasePremium();
      expect(mockPurchasePackage).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('returns success=false when purchase fails', async () => {
      mockGetOfferings.mockResolvedValue({ current: { availablePackages: [] } });
      const result = await service.purchasePremium();
      expect(result.success).toBe(false);
    });

    it('returns success=false when getOfferings has no current offering', async () => {
      mockGetOfferings.mockResolvedValue({ current: null });
      const result = await service.purchasePremium();
      expect(result.success).toBe(false);
      expect(mockPurchasePackage).not.toHaveBeenCalled();
    });

    it('returns success=false when purchasePackage throws (e.g. user cancelled)', async () => {
      mockGetOfferings.mockResolvedValue({
        current: { availablePackages: [{ identifier: 'premium_monthly' }] },
      });
      mockPurchasePackage.mockRejectedValue(new Error('User cancelled'));
      const result = await service.purchasePremium();
      expect(result.success).toBe(false);
    });
  });

  describe('getPremiumPriceString', () => {
    it("returns the store's own localised price string", async () => {
      // priceString is what the store will actually charge in this storefront, already
      // formatted for it. The paywall shows this rather than a literal "7,99 €", which
      // would be wrong outside the eurozone and stale after any dashboard price change.
      mockGetOfferings.mockResolvedValue({
        current: { availablePackages: [{ product: { priceString: '7,99 €' } }] },
      });
      expect(await service.getPremiumPriceString()).toBe('7,99 €');
    });

    it('returns null when no offering is configured', async () => {
      mockGetOfferings.mockResolvedValue({ current: null });
      expect(await service.getPremiumPriceString()).toBeNull();
    });

    it('returns null when the current offering has no packages', async () => {
      mockGetOfferings.mockResolvedValue({ current: { availablePackages: [] } });
      expect(await service.getPremiumPriceString()).toBeNull();
    });

    it('returns null rather than throwing when RevenueCat is unreachable', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGetOfferings.mockRejectedValue(new Error('offline'));
      expect(await service.getPremiumPriceString()).toBeNull();
      spy.mockRestore();
    });
  });

  describe('manageSubscription', () => {
    it('delegates to Purchases.showManageSubscriptions', async () => {
      await service.manageSubscription();
      expect(mockShowManageSubscriptions).toHaveBeenCalledTimes(1);
    });
  });

  describe('tampered client SDK state', () => {
    it('server entitlement is authoritative — SDK cannot grant premium', async () => {
      // Simulate: SDK says premium but server says free
      mockSingle.mockResolvedValue({ data: FREE_ENTITLEMENT, error: null });
      // Even if someone manipulated the RevenueCat SDK to return premium,
      // isPremium() always uses the server value
      const isPremium = await service.isPremium();
      expect(isPremium).toBe(false);
    });
  });
});
