import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { useInterpretation } from '@features/interpretation/useInterpretation';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';

const interpretationService = new MockInterpretationService();
const entitlementService = new MockEntitlementService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: interpretationService,
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: entitlementService,
    notifications: new MockNotificationService(),
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ServicesProvider services={buildRegistry()}>{children}</ServicesProvider>
);

const testRequest = {
  dreamId: 'dream-001',
  description: 'I was standing at the edge of a dark cliff in the fog.',
  style: 'symbolic' as const,
};

describe('Entitlement gate integration', () => {
  beforeEach(() => {
    interpretationService.configure('success');
    entitlementService.configure('free');
  });

  it('shows paywall before service call when limit exhausted', async () => {
    entitlementService.configure('limit_exceeded');
    const interpretSpy = jest.spyOn(interpretationService, 'interpret');

    const { result } = renderHook(() => useInterpretation(), { wrapper });

    await act(async () => {
      result.current.interpret(testRequest);
    });

    // Paywall shown — interpret should not have been called
    expect(result.current.state.status).toBe('paywall');
    expect(interpretSpy).not.toHaveBeenCalled();
  });

  it('calls interpret service when limit not reached', async () => {
    entitlementService.configure('free');
    const interpretSpy = jest.spyOn(interpretationService, 'interpret');

    const { result } = renderHook(() => useInterpretation(), { wrapper });

    await act(async () => {
      result.current.interpret(testRequest);
    });

    expect(result.current.state.status).toBe('success');
    expect(interpretSpy).toHaveBeenCalled();
  });

  it('proceeds normally when entitlement check throws (server will gate)', async () => {
    // If client-side entitlement fetch fails, we still attempt the call
    jest.spyOn(entitlementService, 'canInterpret').mockRejectedValueOnce(new Error('network'));
    const interpretSpy = jest.spyOn(interpretationService, 'interpret');

    const { result } = renderHook(() => useInterpretation(), { wrapper });

    await act(async () => {
      result.current.interpret(testRequest);
    });

    expect(interpretSpy).toHaveBeenCalled();
  });
});
