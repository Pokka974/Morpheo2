import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), navigate: jest.fn(), push: jest.fn() }),
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mockSaveDream = jest.fn().mockResolvedValue({ id: 'mock-id' });
jest.mock('@features/dream-log/dreamRepository', () => ({
  saveDream: (...args: unknown[]) => mockSaveDream(...args),
  validateForInterpretation: jest.fn(),
}));

const mockSyncPendingDreams = jest.fn().mockResolvedValue(undefined);
jest.mock('@features/dream-log/syncService', () => ({
  syncPendingDreams: () => mockSyncPendingDreams(),
}));

import DreamLogScreen from '@app/(main)/log/index';

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
  };
}

describe('DreamLogScreen — save flow', () => {
  beforeEach(() => {
    mockSaveDream.mockClear();
    mockSyncPendingDreams.mockClear();
  });

  it('saves the dream with a valid UUID id, not a local-only "dream_<timestamp>" string', async () => {
    const { getByLabelText, getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <DreamLogScreen />
      </ServicesProvider>
    );

    fireEvent.changeText(
      getByLabelText('Dream description'),
      'I was walking through a misty forest and found a glowing door.'
    );
    fireEvent.press(getByText('Save Dream'));

    await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
    const savedId = mockSaveDream.mock.calls[0][0].id;
    expect(savedId).toMatch(UUID_V4);
  });

  it('triggers a sync immediately after saving so the dream reaches Supabase before interpretation is requested', async () => {
    const { getByLabelText, getByText } = render(
      <ServicesProvider services={buildRegistry()}>
        <DreamLogScreen />
      </ServicesProvider>
    );

    fireEvent.changeText(
      getByLabelText('Dream description'),
      'I was walking through a misty forest and found a glowing door.'
    );
    fireEvent.press(getByText('Save Dream'));

    await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1));
  });
});
