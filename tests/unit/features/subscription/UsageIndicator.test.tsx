import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
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
import { UsageIndicator } from '@features/subscription/UsageIndicator';

function buildRegistry(entitlement: MockEntitlementService): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement,
    notifications: new MockNotificationService(),
  };
}

describe('UsageIndicator', () => {
  it('renders nothing for a premium subscriber', async () => {
    const entitlement = new MockEntitlementService().configure('premium');
    const spy = jest.spyOn(entitlement, 'fetchEntitlement');
    const { toJSON } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(toJSON()).toBeNull();
  });

  it('renders the remaining-interpretations count for a free subscriber', async () => {
    const entitlement = new MockEntitlementService().configure('free');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    // 0 used of 3 -> 3 remaining.
    await waitFor(() => expect(getByText('3 interpretations left this month')).toBeTruthy());
  });

  it('shows the premium nudge badge', async () => {
    const entitlement = new MockEntitlementService().configure('free');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Premium')).toBeTruthy());
  });

  it('shows the reset date alongside the raw used/limit count', async () => {
    const entitlement = new MockEntitlementService().configure('free');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText(/0 of 3 interpretations used/)).toBeTruthy());
  });

  it('uses singular phrasing when exactly one interpretation remains', async () => {
    const entitlement = new MockEntitlementService();
    jest.spyOn(entitlement, 'fetchEntitlement').mockResolvedValue({
      subscriptionTier: 'free',
      interpretationsUsedThisMonth: 2,
      monthlyInterpretationLimit: 3,
      imagesUsedThisMonth: 0,
      monthlyImageLimit: 1,
      bonusImageCredits: 1,
      resetDate: new Date(),
      subscriptionExpiresAt: null,
    });
    const { getByText } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('1 interpretation left this month')).toBeTruthy());
  });

  it('never shows a negative remaining count once the limit is exceeded', async () => {
    const entitlement = new MockEntitlementService().configure('limit_exceeded');
    const { getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('0 interpretations left this month')).toBeTruthy());
    expect(queryByText(/-\d/)).toBeNull();
  });

  it('renders nothing before the fetch resolves', () => {
    const entitlement = new MockEntitlementService().configure('free');
    jest.spyOn(entitlement, 'fetchEntitlement').mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when the fetch rejects', async () => {
    const entitlement = new MockEntitlementService().configure('free');
    const spy = jest
      .spyOn(entitlement, 'fetchEntitlement')
      .mockRejectedValue(new Error('network error'));
    const { toJSON } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(toJSON()).toBeNull();
  });
});
