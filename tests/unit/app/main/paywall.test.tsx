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

  it('renders both the free and premium feature comparison lists', () => {
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <PaywallScreen />
      </ServicesProvider>
    );
    expect(getByText('5 AI interpretations per month')).toBeTruthy();
    expect(getByText('Unlimited AI interpretations')).toBeTruthy();
  });

  it('navigates back after a successful purchase', async () => {
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Start Premium'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('does not navigate back when the purchase is unsuccessful', async () => {
    const registry = buildRegistry();
    jest.spyOn(registry.entitlement, 'purchasePremium').mockResolvedValueOnce({ success: false });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Start Premium'));
    await waitFor(() => expect(registry.entitlement.purchasePremium).toHaveBeenCalled());
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows a spinner and disables the button while purchasing', async () => {
    const registry = buildRegistry();
    let resolvePurchase!: (v: { success: boolean }) => void;
    jest.spyOn(registry.entitlement, 'purchasePremium').mockReturnValueOnce(
      new Promise(resolve => {
        resolvePurchase = resolve;
      })
    );

    const { getByText, queryByText } = render(
      <ServicesProvider services={registry}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Start Premium'));
    await waitFor(() => expect(queryByText('Start Premium')).toBeNull());

    await act(async () => {
      resolvePurchase({ success: true });
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('navigates back when pressing "Maybe Later"', () => {
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <PaywallScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Maybe Later'));
    expect(mockBack).toHaveBeenCalled();
  });
});
