import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { useServices } from '@services/useServices';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';

const mockRegistry: ServiceRegistry = {
  auth: new MockAuthService(),
  localLock: new MockLocalLockService(),
  interpretation: new MockInterpretationService(),
  imageGeneration: new MockImageGenerationService(),
  videoGeneration: new MockVideoGenerationService(),
  storage: new MockStorageService(),
  entitlement: new MockEntitlementService(),
  notifications: new MockNotificationService(),
};

describe('useServices', () => {
  it('throws a descriptive error when used outside ServicesProvider', () => {
    expect(() => {
      renderHook(() => useServices());
    }).toThrow('useServices() must be called within a <ServicesProvider>');
  });

  it('returns all 8 services when provider is present', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ServicesProvider services={mockRegistry}>{children}</ServicesProvider>
    );
    const { result } = renderHook(() => useServices(), { wrapper });

    expect(result.current.auth).toBeDefined();
    expect(result.current.localLock).toBeDefined();
    expect(result.current.interpretation).toBeDefined();
    expect(result.current.imageGeneration).toBeDefined();
    expect(result.current.videoGeneration).toBeDefined();
    expect(result.current.storage).toBeDefined();
    expect(result.current.entitlement).toBeDefined();
    expect(result.current.notifications).toBeDefined();
  });
});
