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

const mockRegistry: ServiceRegistry = {
  auth: new MockAuthService(),
  localLock: new MockLocalLockService(),
  interpretation: interpretationService,
  imageGeneration: new MockImageGenerationService(),
  videoGeneration: new MockVideoGenerationService(),
  storage: new MockStorageService(),
  entitlement: entitlementService,
  notifications: new MockNotificationService(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ServicesProvider services={mockRegistry}>{children}</ServicesProvider>
);

const testRequest = {
  dreamId: 'test-dream',
  description: 'I was flying over a mountain lake at dusk.',
  style: 'symbolic' as const,
};

describe('useInterpretation', () => {
  beforeEach(() => {
    interpretationService.configure('success');
    entitlementService.configure('free');
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    expect(result.current.state.status).toBe('idle');
  });

  it('transitions to loading then success on successful interpretation', async () => {
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    await act(async () => {
      result.current.interpret(testRequest);
    });
    expect(result.current.state.status).toBe('success');
  });

  it('transitions to degraded when isDegraded=true', async () => {
    interpretationService.configure('degraded');
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    await act(async () => {
      result.current.interpret(testRequest);
    });
    expect(result.current.state.status).toBe('degraded');
  });

  it('transitions to error on provider failure', async () => {
    interpretationService.configure('failure');
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    await act(async () => {
      result.current.interpret(testRequest);
    });
    expect(result.current.state.status).toBe('error');
  });

  it('transitions to consent_required on ConsentRequiredError', async () => {
    interpretationService.configure('consent_required');
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    await act(async () => {
      result.current.interpret(testRequest);
    });
    expect(result.current.state.status).toBe('consent_required');
  });

  it('shows paywall before any service call when entitlement blocked', async () => {
    entitlementService.configure('limit_exceeded');
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    await act(async () => {
      result.current.interpret(testRequest);
    });
    expect(result.current.state.status).toBe('paywall');
  });

  it('retry resets to loading state', async () => {
    interpretationService.configure('failure');
    const { result } = renderHook(() => useInterpretation(), { wrapper });
    await act(async () => {
      result.current.interpret(testRequest);
    });
    expect(result.current.state.status).toBe('error');

    interpretationService.configure('success');
    await act(async () => {
      result.current.retry(testRequest);
    });
    expect(result.current.state.status).toBe('success');
  });
});
