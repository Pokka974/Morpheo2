import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';
import type { PurchaseResult } from '@services/entitlement/EntitlementService';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

const entitlementService = new MockEntitlementService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: entitlementService,
    notifications: new MockNotificationService(),
  };
}

import PaywallScreen from '@app/(main)/paywall';

describe('PaywallScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    entitlementService.configure('free');
  });

  it('renders both the free and premium feature comparison lists', async () => {
    const { getByText, findByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <PaywallScreen />
      </ServicesProvider>
    );
    // Awaited so the price fetch settles inside the test rather than after it.
    expect(await findByText('3 AI interpretations per month')).toBeTruthy();
    expect(getByText('1 AI image per month — plus your first one, free')).toBeTruthy();
    expect(getByText('Unlimited AI interpretations')).toBeTruthy();
    expect(getByText('Unlimited AI images')).toBeTruthy();
  });

  // The price is whatever the store says it is in the viewer's storefront. Hardcoding
  // "7,99 €" would be wrong everywhere outside the eurozone and stale the first time the
  // price is changed in the RevenueCat dashboard.
  it('shows the price the store reports rather than a hardcoded one', async () => {
    const registry = buildRegistry();
    jest.spyOn(registry.entitlement, 'getPremiumPriceString').mockResolvedValue('$8.99');

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <PaywallScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('$8.99 / month')).toBeTruthy());
  });

  it('omits the price line entirely when no offering is configured', async () => {
    const registry = buildRegistry();
    const spy = jest.spyOn(registry.entitlement, 'getPremiumPriceString').mockResolvedValue(null);

    const { queryByText } = render(
      <ServicesProvider services={registry}>
        <PaywallScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // A placeholder or an empty "/ month" would read as a broken screen.
    expect(queryByText(/\/ month/)).toBeNull();
  });

  it('navigates back after a successful purchase', async () => {
    const { findByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(await findByText('Start Premium'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('does not navigate back when the purchase is unsuccessful', async () => {
    const registry = buildRegistry();
    jest
      .spyOn(registry.entitlement, 'purchasePremium')
      .mockResolvedValueOnce({ success: false, confirmed: false });

    const { findByText } = render(
      <ServicesProvider services={registry}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(await findByText('Start Premium'));
    await waitFor(() => expect(registry.entitlement.purchasePremium).toHaveBeenCalled());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows a spinner and disables the button while purchasing', async () => {
    const registry = buildRegistry();
    let resolvePurchase!: (v: PurchaseResult) => void;
    jest.spyOn(registry.entitlement, 'purchasePremium').mockReturnValueOnce(
      new Promise(resolve => {
        resolvePurchase = resolve;
      })
    );

    const { findByText, queryByText } = render(
      <ServicesProvider services={registry}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(await findByText('Start Premium'));
    await waitFor(() => expect(queryByText('Start Premium')).toBeNull());

    await act(async () => {
      resolvePurchase({ success: true, confirmed: true });
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('navigates back when pressing "Maybe later"', async () => {
    const { findByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(await findByText('Maybe later'));
    expect(mockBack).toHaveBeenCalled();
  });
});
