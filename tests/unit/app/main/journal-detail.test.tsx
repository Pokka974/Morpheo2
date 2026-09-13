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
const mockReplace = jest.fn();
// Overridden per test via `mockUseLocalSearchParams.mockReturnValue({ dreamId, autoRegenerateImage })`.
const mockUseLocalSearchParams = jest.fn(() => ({ dreamId: 'dream-1' }) as Record<string, string>);
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    // No deps array: re-runs on every render, standing in for "the screen is always
    // focused" in a test environment that never unmounts/refocuses — same convention
    // as readings-index.test.tsx.
    React.useEffect(effect);
  },
}));

let mockImageState: {
  status: string;
  media?: unknown;
  message?: string;
  max?: number;
  resetDate?: Date;
} = { status: 'idle' };
const mockGenerate = jest.fn();
const mockRegenerate = jest.fn();

jest.mock('@features/media-generation/useImageGeneration', () => ({
  useImageGeneration: () => ({
    state: mockImageState,
    generate: mockGenerate,
    regenerate: mockRegenerate,
    reset: jest.fn(),
  }),
}));

const mockDeleteDream = jest.fn();
jest.mock('@features/dream-log/dreamRepository', () => ({
  deleteDream: (...args: unknown[]) => mockDeleteDream(...args),
}));

// The screen kicks the outbound drain straight after a confirmed delete, so the real
// module — and through it `supabase/client`, which throws without env vars — would
// otherwise be pulled into this render-level test.
const mockSyncPendingDreams = jest.fn().mockResolvedValue({ syncedIds: [], failures: [] });
jest.mock('@features/dream-log/syncService', () => ({
  syncPendingDreams: (...args: unknown[]) => mockSyncPendingDreams(...args),
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
  emotions: null,
  lucidity: 'none',
  tone: null,
  clarity: null,
  sleep_quality: null,
  bedtime: null,
  wake_time: null,
  dream_ending: null,
  dream_type: '[]',
  characters: '[]',
  places: '[]',
  linked_dream_id: null,
  logged_at: '2026-01-05T06:40:00.000Z',
};

const DREAM_ROW_WITH_METADATA = {
  ...DREAM_ROW,
  emotions: JSON.stringify(['awe']),
  lucidity: 'lucid',
  tone: 'positive',
  clarity: 4,
  sleep_quality: 4,
  bedtime: '23:15',
  wake_time: '07:10',
  dream_ending: 'resolved',
  dream_type: JSON.stringify(['lucid', 'recurring']),
  characters: JSON.stringify(['a stranger']),
  places: JSON.stringify(['a hotel']),
};

const INTERP_ROW = {
  id: 'interp-1',
  overall_reading: 'A journey into the unknown.',
  keywords: JSON.stringify(['forest', 'mist']),
  emotions: JSON.stringify(['wonder']),
  cultural_references: JSON.stringify([]),
  confidence: 'high',
  prompt_version: 'v1',
  model_used: 'claude-haiku-4-5',
  created_at: '2026-01-05T01:00:00.000Z',
  archetype: null,
  themes: null,
  symbolic_density: null,
};

const INTERP_ROW_WITH_AI_METADATA = {
  ...INTERP_ROW,
  cultural_references: JSON.stringify([
    { symbol: 'water', tradition: 'Jungian', meaning: 'The unconscious mind' },
  ]),
  archetype: 'The Seeker',
  themes: JSON.stringify(['transformation', 'threshold']),
  symbolic_density: 3,
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
    mockReplace.mockClear();
    mockGenerate.mockClear();
    mockRegenerate.mockClear();
    mockUseLocalSearchParams.mockReset().mockReturnValue({ dreamId: 'dream-1' });
    mockImageState = { status: 'idle' };
    imageService.configure('success');
    (db.getFirstAsync as jest.Mock).mockReset();
    (db.getAllAsync as jest.Mock).mockReset().mockResolvedValue([]);
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
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
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

  it('does not auto-trigger image generation; only fires when the Generate button is pressed', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('failure'); // getImage() resolves null in this mode
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Generate image')).toBeTruthy());
    expect(mockGenerate).not.toHaveBeenCalled();

    fireEvent.press(getByText('Generate image'));
    expect(mockGenerate).toHaveBeenCalledWith({
      dreamId: 'dream-1',
      description: DREAM_ROW.description,
      keywords: ['forest', 'mist'],
    });
  });

  it('renders the cached dream illustration when imageGeneration.getImage returns media', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('success');
    const { getByLabelText } = renderScreen();

    await waitFor(() => expect(getByLabelText('Dream illustration')).toBeTruthy());
  });

  it('opens a fullscreen viewer when the hero image is pressed, and closes it', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('success');
    const { getAllByLabelText, getByLabelText, queryByLabelText } = renderScreen();

    await waitFor(() => expect(getAllByLabelText('Dream illustration').length).toBeGreaterThan(0));
    fireEvent.press(getAllByLabelText('Dream illustration')[0]!);

    await waitFor(() => expect(getByLabelText('Close')).toBeTruthy());
    fireEvent.press(getByLabelText('Close'));
    await waitFor(() => expect(queryByLabelText('Close')).toBeNull());
  });

  it('prefers the live generation-hook image over the cached one once it succeeds', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
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

  it('soft-deletes the dream and navigates back when confirming delete via the custom card', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    mockDeleteDream.mockReset().mockResolvedValue(undefined);
    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('Delete')).toBeTruthy());

    // Opens DeleteDreamModal — the OS Alert.alert is no longer used for this.
    fireEvent.press(getByText('Delete'));
    fireEvent.press(getByText('Delete permanently'));

    // Goes through dreamRepository.deleteDream — the same repository path every
    // other dream mutation uses — rather than a raw SQL statement, so the deletion
    // also becomes eligible for the sync queue instead of staying purely local.
    await waitFor(() => expect(mockDeleteDream).toHaveBeenCalledWith('dream-1'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('keeping the dream from the delete card does not delete it', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    mockDeleteDream.mockReset().mockResolvedValue(undefined);
    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('Delete')).toBeTruthy());

    fireEvent.press(getByText('Delete'));
    fireEvent.press(getByText('Keep the dream'));

    expect(mockDeleteDream).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('surfaces the real reason an image failed instead of a generic placeholder', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
    imageService.configure('failure'); // getImage resolves null, so the fallback text would otherwise win
    mockImageState = { status: 'safety_blocked' };
    const { getByText, queryByText } = renderScreen();

    await waitFor(() =>
      expect(
        getByText(
          "This dream couldn't be illustrated — its description was flagged by content safety filtering."
        )
      ).toBeTruthy()
    );
    expect(queryByText('No illustration yet')).toBeNull();
  });

  it('does not render the context section when the dream carries no extra metadata', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Interpret this dream')).toBeTruthy());
    expect(queryByText('Dream context')).toBeNull();
  });

  it('shows the lucid marker and tone dot in the header when the dream carries them', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW_WITH_METADATA)
      .mockResolvedValueOnce(null);
    const { getByText, getByLabelText } = renderScreen();

    await waitFor(() => expect(getByText('lucid')).toBeTruthy());
    expect(getByLabelText('Tone: Positive')).toBeTruthy();
  });

  it('prefers the dream’s own emotions over the interpretation’s in the header chips', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW_WITH_METADATA)
      .mockResolvedValueOnce(INTERP_ROW);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('awe')).toBeTruthy());
    // INTERP_ROW's own emotion ("wonder") no longer wins now that the dream has its own.
    expect(queryByText('wonder')).toBeNull();
  });

  it('counts the noted context fields in the collapsed header', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW_WITH_METADATA)
      .mockResolvedValueOnce(null);
    const { getByText } = renderScreen();

    // bedtime, wake, quality, clarity, lucidity, tone, ending, type, characters, places.
    await waitFor(() => expect(getByText('10 fields noted')).toBeTruthy());
  });

  it('expands the context section to reveal every field the dreamer noted', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW_WITH_METADATA)
      .mockResolvedValueOnce(null);
    const { getAllByText, getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Dream context')).toBeTruthy());
    expect(queryByText('7 h 55')).toBeNull();

    fireEvent.press(getByText('Dream context'));

    // The night: both endpoints kept, not just the duration they imply. Bedtime 23:15
    // → wake 07:10 crosses midnight, so the span is 7h55.
    expect(getByText('Bedtime')).toBeTruthy();
    expect(getByText('23:15')).toBeTruthy();
    expect(getByText('Wake time')).toBeTruthy();
    expect(getByText('07:10')).toBeTruthy();
    expect(getByText('7 h 55')).toBeTruthy();

    // Both 1–5 scales read back their value, not just their dots.
    expect(getByText('Sleep quality')).toBeTruthy();
    expect(getByText('Dream clarity')).toBeTruthy();
    expect(getAllByText('4/5')).toHaveLength(2);

    // The dream: the four enumerated fields, each labelled.
    expect(getByText('Lucid')).toBeTruthy();
    expect(getByText('Positive')).toBeTruthy();
    expect(getByText('Resolved')).toBeTruthy();
    expect(getByText('Lucid dream · Recurring')).toBeTruthy();

    // Who, where.
    expect(getByText('a stranger')).toBeTruthy();
    expect(getByText('a hotel')).toBeTruthy();
  });

  it('shows tone as a readable label, not only a colour dot', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW_WITH_METADATA)
      .mockResolvedValueOnce(null);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Dream context')).toBeTruthy());
    // Collapsed, the header dot is still the only tone signal — the label lives inside.
    expect(queryByText('Positive')).toBeNull();

    fireEvent.press(getByText('Dream context'));
    expect(getByText('Positive')).toBeTruthy();
  });

  it.each([
    ['semi', 'Semi-lucid'],
    ['full', 'Fully lucid'],
  ])('reads back lucidity level "%s" as its own label', async (lucidity, label) => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce({ ...DREAM_ROW_WITH_METADATA, lucidity })
      .mockResolvedValueOnce(null);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Dream context')).toBeTruthy());
    fireEvent.press(getByText('Dream context'));

    // The header marker flattens lucidity to a boolean; the context block must not —
    // "semi" and "full" used to be indistinguishable from "lucid" and "not lucid".
    expect(getByText(label)).toBeTruthy();
  });

  it('renders the night span and the moment the dream was logged', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW_WITH_METADATA)
      .mockResolvedValueOnce(null);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Dream context')).toBeTruthy());
    fireEvent.press(getByText('Dream context'));

    // A 23:15 bedtime means the night started the evening before the 5th. The label
    // comes from the same formatter the log screen uses when the dream is written.
    expect(getByText(/Night of 4–5 January/)).toBeTruthy();
    expect(getByText(/logged January 5 at/)).toBeTruthy();
  });

  it('omits the night span when the bedtime does not straddle two days', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce({ ...DREAM_ROW_WITH_METADATA, bedtime: '02:30' })
      .mockResolvedValueOnce(null);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Dream context')).toBeTruthy());
    fireEvent.press(getByText('Dream context'));

    expect(queryByText(/Night of/)).toBeNull();
    expect(getByText(/logged January 5 at/)).toBeTruthy();
  });

  it('renders the related-dreams chain and navigates to the linked dream on press', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    (db.getAllAsync as jest.Mock).mockResolvedValueOnce([
      {
        id: 'dream-1',
        description: DREAM_ROW.description,
        occurred_at: DREAM_ROW.occurred_at,
        linked_dream_id: 'dream-0',
      },
      {
        id: 'dream-0',
        description: 'An earlier dream about the same forest.',
        occurred_at: '2026-01-01T00:00:00.000Z',
        linked_dream_id: null,
      },
    ]);
    const { getByText, findByText } = renderScreen();

    await waitFor(() => expect(getByText('Related dreams')).toBeTruthy());
    const linkedRow = await findByText('An earlier dream about the same forest.');
    fireEvent.press(linkedRow);
    expect(mockPush).toHaveBeenCalledWith('/(main)/journal/dream-0/detail');
  });

  it('does not render the AI-metadata or cultural-references blocks for a legacy interpretation without them', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW);
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Interpretation')).toBeTruthy());
    expect(queryByText('Generated by Morpheo')).toBeNull();
    expect(queryByText('Cultural references')).toBeNull();
  });

  it('shows the archetype, theme chips and symbolic-density indicator when the interpretation carries them', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW_WITH_AI_METADATA);
    const { getByText, getByLabelText } = renderScreen();

    await waitFor(() => expect(getByText('Generated by Morpheo')).toBeTruthy());
    expect(getByText('The Seeker')).toBeTruthy();
    expect(getByText('Dominant archetype')).toBeTruthy();
    expect(getByText('transformation')).toBeTruthy();
    expect(getByText('threshold')).toBeTruthy();
    expect(getByLabelText('Symbolic density: 3 of 4')).toBeTruthy();
  });

  it('renders cultural references as an always-visible list, not a collapsed accordion', async () => {
    (db.getFirstAsync as jest.Mock)
      .mockResolvedValueOnce(DREAM_ROW)
      .mockResolvedValueOnce(INTERP_ROW_WITH_AI_METADATA);
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Cultural references')).toBeTruthy());
    expect(getByText('water · Jungian')).toBeTruthy();
    expect(getByText('The unconscious mind')).toBeTruthy();
  });

  it('renders the monthly theme-recurrence section with an ordinal header and navigates on row press', async () => {
    (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
    (db.prepareSync as jest.Mock).mockReturnValueOnce({
      executeSync: () => [
        {
          id: 'rp-theme-1',
          user_id: 'mock-user-id',
          term: 'flying',
          pattern_type: 'theme',
          occurrence_count: 2,
          dream_ids: JSON.stringify(['dream-1', 'dream-earlier']),
          last_seen_at: '2026-01-05',
        },
      ],
    });
    (db.getAllAsync as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('linked_dream_id')) return Promise.resolve([]);
      if (sql.includes(' IN (')) {
        return Promise.resolve([
          { id: 'dream-1', description: DREAM_ROW.description, occurred_at: DREAM_ROW.occurred_at },
          {
            id: 'dream-earlier',
            description: 'An earlier flying dream.',
            occurred_at: '2026-01-02T00:00:00.000Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const { getByText, findByText } = renderScreen();

    await waitFor(() => expect(getByText('2nd flying dream this month')).toBeTruthy());
    expect(getByText('this dream')).toBeTruthy();
    const earlierRow = await findByText('An earlier flying dream.');
    fireEvent.press(earlierRow);
    expect(mockPush).toHaveBeenCalledWith('/(main)/journal/dream-earlier/detail');
  });

  describe('refocus reload (FR-031)', () => {
    // `journal` and `log` are sibling tabs — React Navigation keeps this screen mounted
    // and re-focuses it rather than remounting it after an edit, so a plain mount-time
    // effect would keep showing whatever it first loaded. useFocusEffect fixes that;
    // these tests exercise the *same already-rendered instance* picking up fresh data,
    // exactly like returning from the edit screen without a remount.
    it('shows the edit button, wired to the log screen with an editId', async () => {
      (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
      const { getByText } = renderScreen();

      await waitFor(() => expect(getByText('Edit dream')).toBeTruthy());
      fireEvent.press(getByText('Edit dream'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\(main\)\/log\?editId=dream-1&editedAt=\d+$/)
      );
    });

    it('picks up an edited description on refocus, without remounting', async () => {
      (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
      // The title (firstLine of the description) and the narrative both render the
      // same short, single-sentence text, so it appears twice — getAllByText, not
      // getByText.
      const { getAllByText, queryAllByText, rerender } = renderScreen();
      await waitFor(() => expect(getAllByText(DREAM_ROW.description).length).toBeGreaterThan(0));

      const EDITED_ROW = { ...DREAM_ROW, description: 'A completely rewritten dream text.' };
      (db.getFirstAsync as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(EDITED_ROW)
        .mockResolvedValueOnce(null);

      rerender(
        <ServicesProvider services={buildRegistry()}>
          <DreamDetailScreen />
        </ServicesProvider>
      );

      await waitFor(() =>
        expect(getAllByText('A completely rewritten dream text.').length).toBeGreaterThan(0)
      );
      expect(queryAllByText(DREAM_ROW.description).length).toBe(0);
    });

    it('shows the edit-and-regenerate banner once edited_since_interpretation flips true, on refocus', async () => {
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW);
      const { queryByText, getByText, rerender } = renderScreen();
      await waitFor(() => expect(getByText('Interpretation')).toBeTruthy());
      expect(queryByText('You edited this dream')).toBeNull();

      (db.getFirstAsync as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce({ ...DREAM_ROW, edited_since_interpretation: 1 })
        .mockResolvedValueOnce(INTERP_ROW);

      rerender(
        <ServicesProvider services={buildRegistry()}>
          <DreamDetailScreen />
        </ServicesProvider>
      );

      await waitFor(() => expect(getByText('You edited this dream')).toBeTruthy());
    });

    it('waits for the interpretation matching autoRegenerateImage before firing, ignoring a stale one already in state', async () => {
      // This test's useFocusEffect double reruns `load()` on every render, standing
      // in for two real refocuses of the same mounted screen: the first delivers the
      // dream's *older*, already-loaded interpretation ('interp-1'); only the second
      // delivers the fresh one this auto-regenerate request is actually about
      // ('interp-2'). The fix must not fire against the first.
      const NEW_INTERP_ROW = {
        ...INTERP_ROW,
        id: 'interp-2',
        keywords: JSON.stringify(['storm', 'tower']),
      };
      mockUseLocalSearchParams.mockReturnValue({
        dreamId: 'dream-1',
        autoRegenerateImage: 'interp-2',
      });
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW) // stale: id 'interp-1', keywords forest/mist
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(NEW_INTERP_ROW); // fresh: id 'interp-2', keywords storm/tower

      renderScreen();

      // Must fire exactly once, and only with the *fresh* interpretation's keywords —
      // never with 'interp-1's — proving it waited for the matching interpretation
      // rather than firing against whichever one happened to be in state first.
      await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
      expect(mockGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ keywords: ['storm', 'tower'] })
      );
    });

    it('fires the auto-regenerate-image effect again for a distinct autoRegenerateImage value in the same mounted instance', async () => {
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW);
      mockUseLocalSearchParams.mockReturnValue({
        dreamId: 'dream-1',
        autoRegenerateImage: 'interp-1',
      });
      const { rerender } = renderScreen();
      await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));

      // A second edit-and-regenerate cycle later in the same session (this screen
      // never remounts) carries a distinct value — the interpretation's own new id.
      (db.getFirstAsync as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce({ ...INTERP_ROW, id: 'interp-2' });
      mockUseLocalSearchParams.mockReturnValue({
        dreamId: 'dream-1',
        autoRegenerateImage: 'interp-2',
      });

      rerender(
        <ServicesProvider services={buildRegistry()}>
          <DreamDetailScreen />
        </ServicesProvider>
      );

      await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(2));
    });

    it('does not re-fire auto-regenerate-image for the same value across re-renders', async () => {
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW);
      mockUseLocalSearchParams.mockReturnValue({
        dreamId: 'dream-1',
        autoRegenerateImage: 'interp-1',
      });
      const { rerender } = renderScreen();
      await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));

      rerender(
        <ServicesProvider services={buildRegistry()}>
          <DreamDetailScreen />
        </ServicesProvider>
      );
      // Stays at 1 through every further settle — if a regression ever re-fired it,
      // this would keep failing rather than pass by accident.
      await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    });
  });

  describe('overflow menu and Another angle sheet (design refresh)', () => {
    it('opens the "⋯" menu and shows the three actions, each dismissing the menu on press', async () => {
      (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
      const { getByLabelText, getAllByText, queryByText } = renderScreen();

      await waitFor(() => expect(getByLabelText('More actions')).toBeTruthy());
      fireEvent.press(getByLabelText('More actions'));

      // "Edit dream"/"Another angle"/"Delete" now also exist as menu items, in
      // addition to the inline row and the interpretation card — getAllByText.
      expect(getAllByText('Edit dream').length).toBeGreaterThan(0);
      expect(getAllByText('Another angle').length).toBeGreaterThan(0);
      expect(getAllByText('Delete').length).toBeGreaterThan(0);

      // Pressing "Another angle" in the menu closes the menu and opens the sheet.
      fireEvent.press(getAllByText('Another angle')[0]!);
      expect(queryByText('Suggest another angle')).toBeTruthy();
    });

    it('pressing "Edit dream" in the menu navigates to the log screen with an editId', async () => {
      (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
      const { getByLabelText, getAllByText } = renderScreen();

      await waitFor(() => expect(getByLabelText('More actions')).toBeTruthy());
      fireEvent.press(getByLabelText('More actions'));
      fireEvent.press(getAllByText('Edit dream')[0]!);

      expect(mockPush).toHaveBeenCalledWith(
        expect.stringMatching(/^\/\(main\)\/log\?editId=dream-1&editedAt=\d+$/)
      );
    });

    it('pressing "Delete" in the menu opens the delete card', async () => {
      (db.getFirstAsync as jest.Mock).mockResolvedValueOnce(DREAM_ROW).mockResolvedValueOnce(null);
      mockDeleteDream.mockReset().mockResolvedValue(undefined);
      const { getByLabelText, getAllByText, getByText } = renderScreen();

      await waitFor(() => expect(getByLabelText('More actions')).toBeTruthy());
      fireEvent.press(getByLabelText('More actions'));
      fireEvent.press(getAllByText('Delete')[0]!);

      fireEvent.press(getByText('Delete permanently'));
      await waitFor(() => expect(mockDeleteDream).toHaveBeenCalledWith('dream-1'));
    });

    it("the interpretation card's CTA opens the same style sheet, defaulting to Symbolic", async () => {
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW);
      const { getByText, getAllByText } = renderScreen();

      await waitFor(() => expect(getByText('Suggest another angle')).toBeTruthy());
      fireEvent.press(getByText('Suggest another angle'));

      expect(getAllByText('Symbolic / Archetypal').length).toBeGreaterThan(0);
      expect(getByText('Mythological / Cultural')).toBeTruthy();
      expect(getByText('Psychological / Jungian')).toBeTruthy();
      // Free-tier default entitlement: 3 interpretations/month, none used.
      expect(getByText('3 readings left this month')).toBeTruthy();
    });

    it('picking a different reading style and confirming re-interprets with that style', async () => {
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW);
      const { getByText } = renderScreen();

      await waitFor(() => expect(getByText('Suggest another angle')).toBeTruthy());
      fireEvent.press(getByText('Suggest another angle'));

      fireEvent.press(getByText('Mythological / Cultural'));
      fireEvent.press(getByText('Read from this angle'));

      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining(
          `/(main)/journal/dream-1/interpretation?dreamId=dream-1&description=${encodeURIComponent(DREAM_ROW.description)}&style=mythological`
        )
      );
    });

    it('cancelling the sheet does not navigate', async () => {
      (db.getFirstAsync as jest.Mock)
        .mockResolvedValueOnce(DREAM_ROW)
        .mockResolvedValueOnce(INTERP_ROW);
      const { getByText } = renderScreen();

      await waitFor(() => expect(getByText('Suggest another angle')).toBeTruthy());
      fireEvent.press(getByText('Suggest another angle'));
      fireEvent.press(getByText('Cancel'));

      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('style='));
    });
  });
});
