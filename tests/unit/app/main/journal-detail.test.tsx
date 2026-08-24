import React from 'react';
import { Alert } from 'react-native';
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
import { sqlite as db } from '@db/client';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ dreamId: 'dream-1' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

let mockImageState: {
  status: string;
  media?: unknown;
  message?: string;
  max?: number;
  resetDate?: Date;
} = { status: 'idle' };
let mockVideoState: { status: string; job?: unknown; message?: string } = { status: 'idle' };
const mockGenerate = jest.fn();
const mockRegenerate = jest.fn();
const mockSubmitVideo = jest.fn();

jest.mock('@features/media-generation/useImageGeneration', () => ({
  useImageGeneration: () => ({
    state: mockImageState,
    generate: mockGenerate,
    regenerate: mockRegenerate,
    reset: jest.fn(),
  }),
}));

jest.mock('@features/media-generation/useVideoGeneration', () => ({
  useVideoGeneration: () => ({
    state: mockVideoState,
    submit: mockSubmitVideo,
    reset: jest.fn(),
  }),
}));

const mockDeleteDream = jest.fn();
jest.mock('@features/dream-log/dreamRepository', () => ({
  deleteDream: (...args: unknown[]) => mockDeleteDream(...args),
}));

const imageService = new MockImageGenerationService();

function buildRegistry(): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: imageService,
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
  };
}

import DreamDetailScreen from '@app/(main)/journal/[dreamId]/detail';

const DREAM_ROW = {
  id: 'dream-1',
  description: 'I was walking through a misty forest.',
  occurred_at: '2026-01-05T00:00:00.000Z',
};

const INTERP_ROW = {
  id: 'interp-1',
  overall_reading: 'A journey into the unknown.',
  keywords: JSON.stringify(['forest', 'mist']),
  emotions: JSON.stringify(['wonder']),
  cultural_references: JSON.stringify([]),
  confidence: 'high',
  prompt_version: 'v1',
  model_used: 'claude-sonnet-4-6',
  created_at: '2026-01-05T01:00:00.000Z',
};

function renderScreen() {
  return render(
    <ServicesProvider services={buildRegistry()}>
      <DreamDetailScreen />
    </ServicesProvider>
  );
}

describe('DreamDetailScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockGenerate.mockClear();
    mockRegenerate.mockClear();
    mockSubmitVideo.mockClear();
    mockImageState = { status: 'idle' };
    mockVideoState = { status: 'idle' };
    imageService.configure('success');
    (db.getFirstAsync as jest.Mock).mockReset();
    (db.runAsync as jest.Mock).mockReset().mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('shows a loading state before the dream query resolves', () => {
    (db.getFirstAsync as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const { getByText } = renderScreen();
    expect(getByText('Loading…')).toBeTruthy();
  });

  it('shows "Dream not found." when the dream row does not exist', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(null);
    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('This dream could not be found.')).toBeTruthy());
  });

  it('shows the interpret CTA when no interpretation exists yet, and navigates to the interpretation screen on press', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    imageService.configure('success'); // getImage resolves non-null so the auto-generate effect stays inert
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Interpret this dream')).toBeTruthy());
    fireEvent.press(getByText('Interpret this dream'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining('/(main)/journal/dream-1/interpretation?dreamId=dream-1&description=')
    );
  });

  it('renders the interpretation result when an interpretation row exists', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(INTERP_ROW);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Interpretation')).toBeTruthy());
    // Keywords and emotions render as chips on the interpretation card rather than
    // under section headings.
    expect(getByText('forest')).toBeTruthy();
    expect(getByText('wonder')).toBeTruthy();
    expect(queryByText('Interpret this dream')).toBeNull();
  });

  it('applies fallback defaults when keywords/emotions/cultural_references/confidence are missing', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce({
      ...INTERP_ROW,
      keywords: null,
      emotions: null,
      cultural_references: null,
      confidence: null,
    });
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Interpretation')).toBeTruthy());
    // confidence defaults to 'medium' (not 'low'), so the degraded banner must not show
    expect(queryByText(/low confidence/)).toBeNull();
  });

  it('shows the degraded banner when confidence is "low"', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce({ ...INTERP_ROW, confidence: 'low' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText(/low confidence/)).toBeTruthy());
  });

  it('auto-triggers image generation once dream + interpretation exist and no image is cached yet', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('failure'); // getImage() resolves null in this mode
    renderScreen();

    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith({
        dreamId: 'dream-1',
        description: DREAM_ROW.description,
        keywords: ['forest', 'mist'],
      })
    );
  });

  it('renders the cached dream illustration when imageGeneration.getImage returns media', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('success');
    const { getByLabelText } = renderScreen();

    await waitFor(() => expect(getByLabelText('Dream illustration')).toBeTruthy());
  });

  it('prefers the live generation-hook image over the cached one once it succeeds', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('failure');
    mockImageState = {
      status: 'success',
      media: {
        id: 'live-media',
        dreamId: 'dream-1',
        mediaType: 'image',
        generationStatus: 'complete',
        signedUrl: 'https://example.com/live.png',
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '',
        updatedAt: '',
      },
    };
    const { getByLabelText } = renderScreen();

    await waitFor(() => expect(getByLabelText('Dream illustration')).toBeTruthy());
  });


  it('soft-deletes the dream and navigates back when confirming delete', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    mockDeleteDream.mockReset().mockResolvedValue(undefined);
    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('Delete')).toBeTruthy());

    fireEvent.press(getByText('Delete'));
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    expect(alertCall[0]).toBe('Delete this dream?');
    const buttons = alertCall[2] as Array<{ text: string; onPress?: () => void }>;
    const deleteButton = buttons.find(b => b.text === 'Delete')!;
    const cancelButton = buttons.find(b => b.text === 'Cancel')!;
    expect(cancelButton.onPress).toBeUndefined();

    await deleteButton.onPress!();
    // Goes through dreamRepository.deleteDream — the same repository path every
    // other dream mutation uses — rather than a raw SQL statement, so the deletion
    // also becomes eligible for the sync queue instead of staying purely local.
    expect(mockDeleteDream).toHaveBeenCalledWith('dream-1');
    expect(mockBack).toHaveBeenCalled();
  });

  it('submits a video generation request when pressing "Generate Dream Video"', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(INTERP_ROW);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Generate a dream video')).toBeTruthy());
    fireEvent.press(getByText('Generate a dream video'));
    expect(mockSubmitVideo).toHaveBeenCalledWith({
      dreamId: 'dream-1',
      description: DREAM_ROW.description,
      keywords: ['forest', 'mist'],
    });
  });

  it('navigates to the paywall when the video button requires premium', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    mockVideoState = { status: 'premium_required' };
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Upgrade to generate video')).toBeTruthy());
    fireEvent.press(getByText('Upgrade to generate video'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/paywall');
  });

  it('surfaces the real reason an image failed instead of a generic placeholder', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('failure'); // getImage resolves null, so the fallback text would otherwise win
    mockImageState = { status: 'safety_blocked' };
    const { getByText, queryByText } = renderScreen();

    await waitFor(() =>
      expect(
        getByText("This dream couldn't be illustrated — its description was flagged by content safety filtering.")
      ).toBeTruthy()
    );
    expect(queryByText('No illustration yet')).toBeNull();
  });
});
