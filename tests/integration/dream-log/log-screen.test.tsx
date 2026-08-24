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

const mockSyncPendingDreams = jest.fn().mockResolvedValue({ syncedIds: [], failures: [] });
const mockSyncDreamForInterpretation = jest.fn().mockResolvedValue(undefined);
// The error class is declared inside the factory: jest.mock is hoisted above every
// class declaration in this file, so a class defined out here is still in its temporal
// dead zone when the screen's `instanceof` check runs.
jest.mock('@features/dream-log/syncService', () => {
  class DreamNotSyncedError extends Error {
    constructor(id: string) {
      super(`Dream ${id} did not reach the server`);
      this.name = 'DreamNotSyncedError';
    }
  }
  return {
    syncPendingDreams: () => mockSyncPendingDreams(),
    syncDreamForInterpretation: (...args: unknown[]) => mockSyncDreamForInterpretation(...args),
    DreamNotSyncedError,
  };
});

const { DreamNotSyncedError } = jest.requireMock<{
  DreamNotSyncedError: new (dreamId: string) => Error;
}>('@features/dream-log/syncService');

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
    mockSyncDreamForInterpretation.mockReset().mockResolvedValue(undefined);
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

    it('saves the emotions the dreamer picked and the lucid marker alongside the account', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByLabelText('Emotion: calm'));
      fireEvent.press(getByLabelText('Emotion: freedom'));
      fireEvent.press(getByLabelText('Lucid dream'));
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      const saved = mockSaveDream.mock.calls[0][0];
      expect(JSON.parse(saved.emotions)).toEqual(['calm', 'freedom']);
      expect(saved.isLucid).toBe(true);
    });

    it('defaults to no emotions and a non-lucid dream when neither is touched', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      const saved = mockSaveDream.mock.calls[0][0];
      expect(JSON.parse(saved.emotions)).toEqual([]);
      expect(saved.isLucid).toBe(false);
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

    it('counts what the account already is rather than what it still lacks', () => {
      const { getByLabelText, getByText, queryByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), TOO_SHORT);

      expect(getByText('9 chars.')).toBeTruthy();
      expect(getByText('Keep going — a few more words')).toBeTruthy();
      expect(queryByText('Long enough to be interpreted')).toBeNull();
    });

    it('flips the counter hint to "long enough" once the threshold is met', () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);

      expect(getByText(`${LONG_ENOUGH.length} chars.`)).toBeTruthy();
      expect(getByText('Long enough to be interpreted')).toBeTruthy();
    });

    it('keeps the dream and explains itself when the sync fails, instead of navigating into a foreign-key violation', async () => {
      mockSyncDreamForInterpretation.mockRejectedValueOnce(new DreamNotSyncedError('dream-1'));

      const { getByLabelText, getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Interpret this dream'));

      // The dream is saved locally either way — only the trip to the server failed.
      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(
        await findByText(
          'Your dream is saved, but we could not reach the server — it will be interpreted once you are back online.'
        )
      ).toBeTruthy();
      // Navigating would put the interpret Edge Function in front of a dream row that
      // is not there, which surfaces to the user as a generic failure.
      expect(mockPush).not.toHaveBeenCalled();
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

      await waitFor(() => expect(mockSyncDreamForInterpretation).toHaveBeenCalledWith(savedId));
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
      mockSyncDreamForInterpretation.mockReturnValueOnce(
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
