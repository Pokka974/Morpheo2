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

  it('renders the usage summary for a free subscriber', async () => {
    const entitlement = new MockEntitlementService().configure('free');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry(entitlement)}>
        <UsageIndicator />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText(/0 of 5 interpretations used/)).toBeTruthy());
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
