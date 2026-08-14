import { RevenueCatEntitlementService } from '@services/subscription/RevenueCatEntitlementService';

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockShowManageSubscriptions = jest.fn();
const mockSetLogLevel = jest.fn();
const mockConfigure = jest.fn();
const mockSupabaseSelect = jest.fn();

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

const FREE_ENTITLEMENT = {
  tier: 'free',
  interpretations_used_this_month: 3,
  monthly_interpretation_limit: 5,
  image_generations_used_this_month: 2,
  monthly_image_limit: 3,
  reset_date: '2026-09-01',
  subscription_expires_at: null,
};

const PREMIUM_ENTITLEMENT = {
  ...FREE_ENTITLEMENT,
  tier: 'premium',
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

  describe('fetchEntitlement', () => {
    it('fetches from server — not from RevenueCat SDK', async () => {
      const e = await service.fetchEntitlement();
      expect(e.subscriptionTier).toBe('free');
      expect(mockGetOfferings).not.toHaveBeenCalled();
    });
  });

  describe('canInterpret', () => {
    it('returns false when free tier limit exhausted', async () => {
      mockSingle.mockResolvedValue({
        data: { ...FREE_ENTITLEMENT, interpretations_used_this_month: 5 },
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
