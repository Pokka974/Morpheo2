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

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: (...args: unknown[]) => mockReplace(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    push: (...args: unknown[]) => mockPush(...args),
  }),
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

const LONG_ENOUGH = 'I was walking through a misty forest and found a glowing door.';
const TOO_SHORT = 'Too short';

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

describe('DreamLogScreen', () => {
  beforeEach(() => {
    mockSaveDream.mockClear();
    mockSyncPendingDreams.mockClear();
    mockReplace.mockClear();
    mockNavigate.mockClear();
    mockPush.mockClear();
  });

  describe('save draft', () => {
    it('saves the dream with a valid UUID id, not a local-only "dream_<timestamp>" string', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      const savedId = mockSaveDream.mock.calls[0][0].id;
      expect(savedId).toMatch(UUID_V4);
    });

    it('triggers a best-effort sync after saving and returns to the journal list', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(main)/journal'));
    });

    it('is enabled below the interpretation length threshold — a draft has no minimum', () => {
      const { getByLabelText, getByRole } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), TOO_SHORT);

      expect(
        getByRole('button', { name: 'Save draft' }).props.accessibilityState?.disabled
      ).toBeFalsy();
    });
  });

  describe('interpret directly', () => {
    it('is disabled until the 20-character minimum is met, unlike Save draft', () => {
      const { getByLabelText, getByRole } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), TOO_SHORT);

      expect(
        getByRole('button', { name: 'Interpret this dream' }).props.accessibilityState?.disabled
      ).toBe(true);
      expect(
        getByRole('button', { name: 'Save draft' }).props.accessibilityState?.disabled
      ).toBeFalsy();
    });

    it('shows how many more characters are needed, below the threshold', () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), TOO_SHORT);

      expect(getByText('11 more characters to unlock interpretation.')).toBeTruthy();
    });

    it('saves, awaits the sync, then navigates straight to the auto-firing interpretation screen — one press, not two', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Interpret this dream'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      const savedId = mockSaveDream.mock.calls[0][0].id;
      expect(savedId).toMatch(UUID_V4);

      await waitFor(() => expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(mockPush).toHaveBeenCalledWith(
          `/(main)/journal/${savedId}/interpretation?dreamId=${savedId}&description=${encodeURIComponent(LONG_ENOUGH)}`
        )
      );
      // The draft path's fire-and-forget navigate is never called on this path.
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('waits for the sync to resolve before navigating — the interpret screen must not fire against a dream the server does not have yet', async () => {
      let resolveSync: () => void = () => {};
      mockSyncPendingDreams.mockReturnValueOnce(
        new Promise<void>(resolve => {
          resolveSync = resolve;
        })
      );

      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Interpret this dream'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      // Sync is in flight; navigation must not have happened yet.
      expect(mockPush).not.toHaveBeenCalled();

      resolveSync();
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    });
  });
});
