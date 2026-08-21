import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';
import { sqlite as db } from '@db/client';

const mockRouterReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    dreamId: 'test-dream-id',
    description: 'I was walking through a misty forest and found a glowing door.',
  }),
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-id' } } }) },
    from: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({}) }),
      insert: jest.fn().mockResolvedValue({}),
    }),
  },
}));

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

import InterpretationScreen from '@app/(main)/journal/[dreamId]/interpretation';

describe('InterpretationScreen', () => {
  beforeEach(() => {
    interpretationService.configure('success');
    entitlementService.configure('free');
    mockRouterReplace.mockClear();
    (db.runAsync as jest.Mock).mockClear();
  });

  it('shows empty state (Interpret CTA) initially', () => {
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    expect(getByText('Interpret Dream')).toBeTruthy();
  });

  it('renders all four interpretation sections on success', async () => {
    interpretationService.configure('success');
    const { getByText, queryByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Interpret Dream'));
    await waitFor(() => {
      expect(queryByText('Interpretation')).toBeTruthy();
      expect(queryByText('Symbols')).toBeTruthy();
      expect(queryByText('Emotions')).toBeTruthy();
    });
  });

  it('shows retry button on provider failure', async () => {
    interpretationService.configure('failure');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Interpret Dream'));
    await waitFor(() => {
      expect(getByText('Try Again')).toBeTruthy();
    });
  });

  it('persists the interpretation to local SQLite and navigates back to the detail screen on success', async () => {
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Interpret Dream'));

    await waitFor(() => {
      expect(db.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO interpretations'),
        expect.arrayContaining(['test-dream-id'])
      );
    });
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/(main)/journal/test-dream-id/detail');
    });
  });

  it('shows paywall before service call when limit exceeded', async () => {
    entitlementService.configure('limit_exceeded');
    const { getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <InterpretationScreen />
      </ServicesProvider>
    );
    fireEvent.press(getByText('Interpret Dream'));
    await waitFor(() => {
      expect(getByText(/Upgrade/i)).toBeTruthy();
    });
  });
});
