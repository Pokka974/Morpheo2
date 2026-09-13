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

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
// Defaults to true (deep-linked-with-history is the common case); the back-button test
// overrides this to false to exercise the "nothing to go back to" fallback.
const mockCanGoBack = jest.fn(() => true);
// Overridden per edit-mode test via `mockUseLocalSearchParams.mockReturnValue({ editId: ... })`;
// defaults to no params, matching every create-flow test in this file.
const mockUseLocalSearchParams = jest.fn(() => ({}) as { editId?: string; editedAt?: string });
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: (...args: unknown[]) => mockReplace(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    canGoBack: () => mockCanGoBack(),
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

// The real module has no jest-expo stand-in (see __mocks__/expo-speech-recognition.js) and
// its default mock makes `useSpeechRecognitionEvent` a no-op — fine for every test that
// never switches to dictation, but the dictation tests below need to invoke the 'result'
// and 'error' listeners the screen registers, so this file captures them by name instead.
const mockRequestPermissionsAsync = jest
  .fn()
  .mockResolvedValue({ granted: true, status: 'granted' });
const mockSpeechStart = jest.fn();
const mockSpeechStop = jest.fn();
const speechRecognitionHandlers: Record<string, (event: unknown) => void> = {};
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    start: (...args: unknown[]) => mockSpeechStart(...args),
    stop: (...args: unknown[]) => mockSpeechStop(...args),
    abort: jest.fn(),
    requestPermissionsAsync: () => mockRequestPermissionsAsync(),
    getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, status: 'granted' })),
  },
  useSpeechRecognitionEvent: (name: string, handler: (event: unknown) => void) => {
    speechRecognitionHandlers[name] = handler;
  },
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mockSaveDream = jest.fn().mockResolvedValue({ id: 'mock-id' });
const mockUpdateDream = jest.fn().mockResolvedValue(undefined);
const mockGetDreamById = jest.fn().mockResolvedValue(null);
const mockGetTagSuggestions = jest.fn().mockResolvedValue([]);
const mockGetRecentDreamsForLinking = jest.fn().mockResolvedValue([]);
jest.mock('@features/dream-log/dreamRepository', () => ({
  saveDream: (...args: unknown[]) => mockSaveDream(...args),
  updateDream: (...args: unknown[]) => mockUpdateDream(...args),
  getDreamById: (...args: unknown[]) => mockGetDreamById(...args),
  validateForInterpretation: jest.fn(),
  getTagSuggestions: (...args: unknown[]) => mockGetTagSuggestions(...args),
  getRecentDreamsForLinking: (...args: unknown[]) => mockGetRecentDreamsForLinking(...args),
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

const EXISTING_DREAM = {
  id: 'dream-42',
  userId: 'user-1',
  description: 'An existing dream about flying over mountains at dawn.',
  occurredAt: '2026-08-01',
  emotions: '["awe"]',
  isLucid: false,
  loggedAt: '2026-08-01T00:00:00.000Z',
  lastModifiedAt: '2026-08-01T00:00:00.000Z',
  isDeleted: false,
  editedSinceInterpretation: false,
  syncStatus: 'local',
  bedtime: '23:00',
  wakeTime: '07:00',
  sleepQuality: 4,
  clarity: 3,
  lucidity: 'none',
  tone: null,
  dreamEnding: null,
  dreamType: '[]',
  characters: '[]',
  places: '[]',
  linkedDreamId: null,
  dayStress: null,
  presleepSubstances: '[]',
};

function buildRegistry(authMode: 'success' | 'failure' = 'success'): ServiceRegistry {
  return {
    auth: new MockAuthService().configure(authMode),
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
    mockUpdateDream.mockClear().mockResolvedValue(undefined);
    mockGetDreamById.mockReset().mockResolvedValue(null);
    mockGetTagSuggestions.mockClear().mockResolvedValue([]);
    mockGetRecentDreamsForLinking.mockClear().mockResolvedValue([]);
    mockSyncPendingDreams.mockClear();
    mockSyncDreamForInterpretation.mockReset().mockResolvedValue(undefined);
    mockReplace.mockClear();
    mockNavigate.mockClear();
    mockPush.mockClear();
    mockBack.mockClear();
    mockCanGoBack.mockClear().mockReturnValue(true);
    mockUseLocalSearchParams.mockReset().mockReturnValue({});
    mockRequestPermissionsAsync.mockClear().mockResolvedValue({ granted: true, status: 'granted' });
    mockSpeechStart.mockClear();
    mockSpeechStop.mockClear();
    delete speechRecognitionHandlers.result;
    delete speechRecognitionHandlers.error;
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
      // The boolean lucid toggle is gone — lucidity is now a 4-level control inside
      // the collapsed "The dream itself" section.
      fireEvent.press(getByText('The dream itself'));
      fireEvent.press(getByText('Lucid'));
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      const saved = mockSaveDream.mock.calls[0][0];
      expect(JSON.parse(saved.emotions)).toEqual(['calm', 'freedom']);
      expect(saved.isLucid).toBe(true);
      expect(saved.lucidity).toBe('lucid');
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

    it('lights the editor border while the description field is focused', () => {
      const { getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      function findEditorContainer() {
        let node = getByLabelText('Dream description').parent;
        while (node && !Array.isArray(node.props.style)) {
          node = node.parent;
        }
        return node;
      }

      fireEvent(getByLabelText('Dream description'), 'focus');
      expect(findEditorContainer()?.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ borderColor: expect.anything() })])
      );

      fireEvent(getByLabelText('Dream description'), 'blur');
      expect(findEditorContainer()?.props.style.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('night summary / date picker', () => {
    it('describes the dream date as a night, not a single day', () => {
      const { getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      // Exact day/month depend on "today", but the phrasing itself — a night
      // spanning two days, not the bare single-day pill this replaces — is fixed.
      expect(getByText(/^Night of /)).toBeTruthy();
      expect(getByText('logged today')).toBeTruthy();
      expect(getByText('edit')).toBeTruthy();
    });

    it('opens the picker on a single press anywhere on the night summary, not just the "edit" label', () => {
      const { getByText, queryByTestId, getByTestId } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      expect(queryByTestId('date-time-picker')).toBeNull();
      fireEvent.press(getByText(/^Night of /));
      expect(getByTestId('date-time-picker')).toBeTruthy();
    });

    it('updates the night label once a new date is confirmed', () => {
      const { getByText, getByTestId } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByText(/^Night of /));
      act(() => {
        getByTestId('date-time-picker').props.onChange(
          { type: 'set' },
          new Date('2026-01-05T12:00:00.000Z')
        );
      });
      // The sheet holds the scrolled value as a draft until it is confirmed —
      // see DateTimePickerSheet: committing on the picker's own onChange is the
      // exact bug this replaced.
      fireEvent.press(getByText('Save'));

      expect(getByText('Night of 5–6 January')).toBeTruthy();
    });

    it('saves the confirmed occurredAt date, not the date the screen happened to mount with', async () => {
      const { getByText, getByTestId, getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByText(/^Night of /));
      act(() => {
        getByTestId('date-time-picker').props.onChange(
          { type: 'set' },
          new Date('2026-01-05T12:00:00.000Z')
        );
      });
      fireEvent.press(getByText('Save'));

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(mockSaveDream.mock.calls[0][0].occurredAt).toBe('2026-01-05');
    });
  });

  describe('sleep time pickers', () => {
    it('keeps an in-progress bedtime scroll when something elsewhere on the screen re-renders it', async () => {
      // Regression test: `bedtime ?? new Date()` used to create a brand-new Date
      // object on every render, which reset the picker's in-progress value on
      // whatever unrelated re-render (e.g. typing) happened to land mid-scroll —
      // reported as the bedtime/wake-time pickers "not working at all".
      const { getByText, getByLabelText, getByTestId } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByText('Sleep'));
      fireEvent.press(getByLabelText('Bedtime'));

      const scrolled = new Date(2026, 0, 1, 23, 15);
      act(() => {
        getByTestId('date-time-picker').props.onChange({ type: 'set' }, scrolled);
      });

      // An unrelated state update elsewhere on the same screen, re-rendering it
      // while the bedtime sheet is still open and uncommitted.
      fireEvent.changeText(getByLabelText('Dream description'), 'A re-render mid-scroll.');

      fireEvent.press(getByText('Save'));
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(mockSaveDream.mock.calls[0][0].bedtime).toBe('23:15');
    });

    it('keeps bedtime and wake time independent of each other', async () => {
      const { getByText, getByLabelText, getByTestId } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByText('Sleep'));

      fireEvent.press(getByLabelText('Bedtime'));
      act(() => {
        getByTestId('date-time-picker').props.onChange(
          { type: 'set' },
          new Date(2026, 0, 1, 23, 0)
        );
      });
      fireEvent.press(getByText('Save'));

      fireEvent.press(getByLabelText('Wake time'));
      act(() => {
        getByTestId('date-time-picker').props.onChange(
          { type: 'set' },
          new Date(2026, 0, 2, 7, 30)
        );
      });
      fireEvent.press(getByText('Save'));

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      const saved = mockSaveDream.mock.calls[0][0];
      expect(saved.bedtime).toBe('23:00');
      expect(saved.wakeTime).toBe('07:30');
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

  describe('edit mode (FR-031)', () => {
    beforeEach(() => {
      mockUseLocalSearchParams.mockReturnValue({
        editId: EXISTING_DREAM.id,
        editedAt: 'first-press',
      });
      mockGetDreamById.mockResolvedValue(EXISTING_DREAM);
    });

    it('shows the edit title and hydrates the description from the existing dream', async () => {
      const { findByText, findByDisplayValue } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByText('Edit dream');
      await findByDisplayValue(EXISTING_DREAM.description);
    });

    it('hydrates with no tags rather than crashing when a stored array field is malformed', async () => {
      mockGetDreamById.mockResolvedValue({ ...EXISTING_DREAM, emotions: 'not valid json{' });
      const { findByDisplayValue, queryByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      expect(queryByLabelText('Emotion: awe')?.props.accessibilityState?.checked).toBeFalsy();
    });

    it('leaves the form blank rather than throwing when the dream being edited no longer exists', async () => {
      mockGetDreamById.mockResolvedValue(null);
      const { findByText, queryByDisplayValue } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByText('Edit dream');
      expect(queryByDisplayValue(EXISTING_DREAM.description)).toBeNull();
    });

    it('shows placeholder times rather than calling fromTimeString when bedtime/wake time are unset', async () => {
      mockGetDreamById.mockResolvedValue({ ...EXISTING_DREAM, bedtime: null, wakeTime: null });
      const { findByDisplayValue, getByText, getAllByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      fireEvent.press(getByText('Sleep'));
      expect(getAllByText('—')).toHaveLength(2);
    });

    it('shows a single Save button instead of the create-flow pair', async () => {
      const { findByDisplayValue, queryByText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      expect(queryByText('Interpret this dream')).toBeNull();
      expect(queryByText('Save draft')).toBeNull();
      expect(getByText('Save')).toBeTruthy();
    });

    it('saves changes via updateDream (not saveDream) and navigates to the dream detail screen', async () => {
      const { findByDisplayValue, getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save'));

      await waitFor(() => expect(mockUpdateDream).toHaveBeenCalledTimes(1));
      expect(mockUpdateDream).toHaveBeenCalledWith(
        EXISTING_DREAM.id,
        expect.objectContaining({ description: LONG_ENOUGH })
      );
      expect(mockSaveDream).not.toHaveBeenCalled();
      // `replace`, not `dismissTo`: this hop is cross-tab (log has no Stack of its
      // own), where dismissTo's stack-scoped POP_TO does not apply.
      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(`/(main)/journal/${EXISTING_DREAM.id}/detail`)
      );
    });

    it('re-hydrates on a second "Edit dream" press for the same dream, even though editId is unchanged', async () => {
      // `log` is a persistent tab: this screen is never remounted between two edit
      // sessions for the same dream in one app session, so editId alone (unchanged
      // across both presses) cannot be what triggers the second hydration —
      // `editedAt` (a fresh value on every press) is.
      const { findByDisplayValue, rerender } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      await findByDisplayValue(EXISTING_DREAM.description);

      const LATER_REVISION = {
        ...EXISTING_DREAM,
        description: 'A second, later revision of the same dream.',
      };
      mockGetDreamById.mockResolvedValue(LATER_REVISION);
      mockUseLocalSearchParams.mockReturnValue({
        editId: EXISTING_DREAM.id,
        editedAt: 'second-press',
      });

      rerender(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(LATER_REVISION.description);
    });
  });

  describe('back navigation', () => {
    it('goes back when there is history', () => {
      mockCanGoBack.mockReturnValue(true);
      const { getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByLabelText('Back'));

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates to the journal when deep-linked with nothing to go back to', () => {
      mockCanGoBack.mockReturnValue(false);
      const { getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByLabelText('Back'));

      expect(mockBack).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/(main)/journal');
    });
  });

  describe('requires an active session', () => {
    it('redirects to sign-in and never calls saveDream when there is no session', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry('failure')}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in'));
      expect(mockSaveDream).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('shows the thrown message when interpreting fails for a reason other than an unsynced dream', async () => {
      mockSyncDreamForInterpretation.mockRejectedValueOnce(new Error('Server exploded'));
      const { getByLabelText, getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Interpret this dream'));

      expect(await findByText('Server exploded')).toBeTruthy();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when interpreting rejects with something other than an Error', async () => {
      mockSyncDreamForInterpretation.mockRejectedValueOnce('not an Error instance');
      const { getByLabelText, getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Interpret this dream'));

      expect(await findByText('Could not save the dream.')).toBeTruthy();
    });

    it('falls back to a generic message when saving a draft rejects with something other than an Error', async () => {
      mockSaveDream.mockRejectedValueOnce('not an Error instance');
      const { getByLabelText, getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      expect(await findByText('Could not save the dream.')).toBeTruthy();
    });

    it('still navigates after saving a draft even when the background sync fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSyncPendingDreams.mockRejectedValueOnce(new Error('offline'));
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/(main)/journal'));
      await waitFor(() =>
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Immediate post-save sync failed; dream stays queued:',
          expect.any(Error)
        )
      );
      consoleErrorSpy.mockRestore();
    });

    it('shows an error and does not navigate when saving edited changes fails', async () => {
      mockUseLocalSearchParams.mockReturnValue({ editId: EXISTING_DREAM.id, editedAt: 'press-1' });
      mockGetDreamById.mockResolvedValue(EXISTING_DREAM);
      mockUpdateDream.mockRejectedValueOnce(new Error('conflict'));
      const { findByDisplayValue, getByLabelText, getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save'));

      expect(await findByText('conflict')).toBeTruthy();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when saving edited changes rejects with something other than an Error', async () => {
      mockUseLocalSearchParams.mockReturnValue({ editId: EXISTING_DREAM.id, editedAt: 'press-1' });
      mockGetDreamById.mockResolvedValue(EXISTING_DREAM);
      mockUpdateDream.mockRejectedValueOnce('not an Error instance');
      const { findByDisplayValue, getByLabelText, getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save'));

      expect(await findByText('Could not save the dream.')).toBeTruthy();
    });

    it('still navigates after saving edited changes even when the background sync fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockUseLocalSearchParams.mockReturnValue({ editId: EXISTING_DREAM.id, editedAt: 'press-1' });
      mockGetDreamById.mockResolvedValue(EXISTING_DREAM);
      mockSyncPendingDreams.mockRejectedValueOnce(new Error('offline'));
      const { findByDisplayValue, getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await findByDisplayValue(EXISTING_DREAM.description);
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save'));

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(`/(main)/journal/${EXISTING_DREAM.id}/detail`)
      );
      await waitFor(() =>
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Immediate post-save sync failed; dream stays queued:',
          expect.any(Error)
        )
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('date/time picker cancel', () => {
    it.each([
      ['Night of ', 'occurredAt'],
      ['Bedtime', 'bedtime'],
      ['Wake time', 'wakeTime'],
    ])('dismisses the %s sheet without changing its value on Cancel', async label => {
      const { getByText, queryByTestId, getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      if (label === 'Night of ') {
        fireEvent.press(getByText(/^Night of /));
      } else {
        fireEvent.press(getByText('Sleep'));
        fireEvent.press(getByLabelText(label));
      }
      expect(getByText('Cancel')).toBeTruthy();

      fireEvent.press(getByText('Cancel'));

      expect(queryByTestId('date-time-picker')).toBeNull();
    });
  });

  describe('linked dream', () => {
    it('fetches and shows candidates when the dreamer marks this as a continuation', async () => {
      mockGetRecentDreamsForLinking.mockResolvedValueOnce([
        { id: 'dream-1', title: 'The lighthouse dream', occurredAt: '2026-08-01' },
      ]);
      const { getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      // Wait for the session-derived userId to land before toggling — the fetch is
      // gated on it.
      await waitFor(() => expect(mockGetTagSuggestions).toHaveBeenCalled());

      fireEvent.press(getByText('Who, where'));
      fireEvent.press(getByText('Already dreamed this'));

      expect(await findByText('The lighthouse dream')).toBeTruthy();
      expect(mockGetRecentDreamsForLinking).toHaveBeenCalledWith('mock-user-id', null);
    });

    it('shows the empty-candidates message when there is nothing to link to', async () => {
      mockGetRecentDreamsForLinking.mockResolvedValueOnce([]);
      const { getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      await waitFor(() => expect(mockGetTagSuggestions).toHaveBeenCalled());

      fireEvent.press(getByText('Who, where'));
      fireEvent.press(getByText('Already dreamed this'));

      expect(await findByText('None — this is a new thread')).toBeTruthy();
    });

    it('clears the selection when toggled back off', async () => {
      mockGetRecentDreamsForLinking.mockResolvedValueOnce([
        { id: 'dream-1', title: 'The lighthouse dream', occurredAt: '2026-08-01' },
      ]);
      const { getByText, findByText, queryByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      await waitFor(() => expect(mockGetTagSuggestions).toHaveBeenCalled());

      fireEvent.press(getByText('Who, where'));
      fireEvent.press(getByText('Already dreamed this'));
      fireEvent.press(await findByText('The lighthouse dream'));
      fireEvent.press(getByText('Already dreamed this'));

      expect(queryByText('Which dream does this continue?')).toBeNull();
    });

    it('fetches linkable dreams on load when editing a dream that is already linked', async () => {
      mockUseLocalSearchParams.mockReturnValue({ editId: EXISTING_DREAM.id, editedAt: 'press-1' });
      mockGetDreamById.mockResolvedValue({ ...EXISTING_DREAM, linkedDreamId: 'dream-1' });
      mockGetRecentDreamsForLinking.mockResolvedValueOnce([
        { id: 'dream-1', title: 'The lighthouse dream', occurredAt: '2026-08-01' },
      ]);

      const { getByText, findByRole } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      await waitFor(() => expect(mockGetRecentDreamsForLinking).toHaveBeenCalledTimes(1));
      expect(mockGetRecentDreamsForLinking).toHaveBeenCalledWith('user-1', EXISTING_DREAM.id);

      fireEvent.press(getByText('Who, where'));
      // Also shown as the (already-selected) linked-dream caption below the chip row —
      // targeting the chip by role keeps this unambiguous.
      expect(
        (await findByRole('checkbox', { name: 'The lighthouse dream' })).props.accessibilityState
          ?.checked
      ).toBe(true);
    });
  });

  describe('dream metadata chips', () => {
    it('saves the picked tone', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('The dream itself'));
      fireEvent.press(getByText('Positive'));
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(mockSaveDream.mock.calls[0][0].tone).toBe('positive');
    });

    it('deselects a tone chip pressed a second time', () => {
      const { getByText, getByRole } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('The dream itself'));

      fireEvent.press(getByText('Positive'));
      expect(getByRole('checkbox', { name: 'Positive' }).props.accessibilityState?.checked).toBe(
        true
      );

      fireEvent.press(getByText('Positive'));
      expect(getByRole('checkbox', { name: 'Positive' }).props.accessibilityState?.checked).toBe(
        false
      );
    });

    it('saves the picked dream ending', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('The dream itself'));
      fireEvent.press(getByText('Resolved'));
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(mockSaveDream.mock.calls[0][0].dreamEnding).toBe('resolved');
    });

    it('deselects a dream-ending chip pressed a second time', () => {
      const { getByText, getByRole } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('The dream itself'));

      fireEvent.press(getByText('Resolved'));
      expect(getByRole('checkbox', { name: 'Resolved' }).props.accessibilityState?.checked).toBe(
        true
      );

      fireEvent.press(getByText('Resolved'));
      expect(getByRole('checkbox', { name: 'Resolved' }).props.accessibilityState?.checked).toBe(
        false
      );
    });

    it('saves the toggled dream type tags, and removes one toggled off again', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('The dream itself'));
      fireEvent.press(getByText('Recurring'));
      fireEvent.press(getByText('Nightmare'));
      fireEvent.press(getByText('Recurring'));
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(JSON.parse(mockSaveDream.mock.calls[0][0].dreamType)).toEqual(['nightmare']);
    });

    it('saves the toggled pre-sleep substance tags, and removes one toggled off again', async () => {
      const { getByLabelText, getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('Personal context'));
      fireEvent.press(getByText('Melatonin'));
      fireEvent.press(getByText('Alcohol'));
      fireEvent.press(getByText('Melatonin'));
      fireEvent.changeText(getByLabelText('Dream description'), LONG_ENOUGH);
      fireEvent.press(getByText('Save draft'));

      await waitFor(() => expect(mockSaveDream).toHaveBeenCalledTimes(1));
      expect(JSON.parse(mockSaveDream.mock.calls[0][0].presleepSubstances)).toEqual(['alcohol']);
    });
  });

  describe('voice dictation', () => {
    it('starts listening when permission is granted and switching to Dictate', async () => {
      const { getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByText('Dictate'));

      await waitFor(() => expect(mockSpeechStart).toHaveBeenCalledTimes(1));
      expect(await findByText('0:00')).toBeTruthy();
    });

    it('falls back to Write and shows an error when permission is denied', async () => {
      mockRequestPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'denied' });
      const { getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      fireEvent.press(getByText('Dictate'));

      expect(await findByText('Voice dictation is not available on this device.')).toBeTruthy();
      expect(mockSpeechStart).not.toHaveBeenCalled();
    });

    it('falls back to Write when the recognizer reports an error mid-session', async () => {
      const { getByText, findByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('Dictate'));
      await waitFor(() => expect(mockSpeechStart).toHaveBeenCalledTimes(1));

      act(() => {
        speechRecognitionHandlers.error?.({});
      });

      expect(await findByText('Voice dictation is not available on this device.')).toBeTruthy();
      expect(mockSpeechStop).toHaveBeenCalledTimes(1);
    });

    it('appends only final transcripts to the description', async () => {
      const { getByText, getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('Dictate'));
      await waitFor(() => expect(mockSpeechStart).toHaveBeenCalledTimes(1));

      act(() => {
        speechRecognitionHandlers.result?.({
          isFinal: false,
          results: [{ transcript: 'a partial phrase' }],
        });
      });
      act(() => {
        speechRecognitionHandlers.result?.({
          isFinal: true,
          results: [{ transcript: 'a finished sentence' }],
        });
      });

      expect(getByLabelText('Dream description').props.value).toBe('a finished sentence');
    });

    it('leaves the description untouched when a final result carries no transcript', async () => {
      const { getByText, getByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('Dictate'));
      await waitFor(() => expect(mockSpeechStart).toHaveBeenCalledTimes(1));

      act(() => {
        speechRecognitionHandlers.result?.({ isFinal: true, results: [] });
      });

      expect(getByLabelText('Dream description').props.value).toBe('');
    });

    it('stops listening when switching back to Write mid-dictation', async () => {
      const { getByText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );
      fireEvent.press(getByText('Dictate'));
      await waitFor(() => expect(mockSpeechStart).toHaveBeenCalledTimes(1));

      fireEvent.press(getByText('Write'));

      expect(mockSpeechStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('scroll to top', () => {
    it('appears once scrolled down, and pressing it does not throw', () => {
      const { getByLabelText, getByTestId, queryByLabelText } = render(
        <ServicesProvider services={buildRegistry()}>
          <DreamLogScreen />
        </ServicesProvider>
      );

      expect(queryByLabelText('Scroll to top', { includeHiddenElements: true })).toBeTruthy();

      fireEvent.scroll(getByTestId('log-scroll-view'), {
        nativeEvent: { contentOffset: { y: 500 } },
      });

      expect(() => fireEvent.press(getByLabelText('Scroll to top'))).not.toThrow();
    });
  });
});
