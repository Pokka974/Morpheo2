import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    // No deps array: re-runs on every render, standing in for "the screen is
    // always focused" in a test environment that never unmounts/refocuses.
    React.useEffect(effect);
  },
}));

const mockGetUser = jest.fn();
jest.mock('@services/../supabase/client', () => ({
  supabase: { auth: { getUser: (...args: unknown[]) => mockGetUser(...args) } },
}));

const mockGetTopRecurrences = jest.fn();
jest.mock('@features/recurrence/recurrenceRepository', () => ({
  getTopRecurrences: (...args: unknown[]) => mockGetTopRecurrences(...args),
}));

const mockGetReadings = jest.fn();
jest.mock('@features/readings/readingsRepository', () => ({
  getReadings: (...args: unknown[]) => mockGetReadings(...args),
}));

import ReadingsScreen from '@app/(main)/readings/index';

function reading(
  overrides: Partial<{
    dreamId: string;
    title: string;
    occurredAt: string;
    status: 'ready' | 'short' | 'pending';
    excerpt: string | null;
    keywords: string[];
    confidence: 'high' | 'medium' | 'low' | null;
  }>
) {
  return {
    dreamId: 'dream-1',
    title: 'A flight over the ocean',
    occurredAt: '2026-08-01',
    status: 'ready' as const,
    excerpt: 'A reading about flight and freedom.',
    keywords: ['flight', 'ocean'],
    confidence: 'high' as const,
    ...overrides,
  };
}

describe('ReadingsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGetUser.mockReset();
    mockGetTopRecurrences.mockReset().mockResolvedValue([]);
    mockGetReadings.mockReset();
  });

  it('shows a loading state before readings resolve', () => {
    mockGetUser.mockImplementation(() => new Promise(() => {}));
    const { getByText } = render(<ReadingsScreen />);
    expect(getByText('Loading your readings…')).toBeTruthy();
  });

  it('shows the empty state when there are no readings and no filter is active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetReadings.mockResolvedValue([]);

    const { getByText } = render(<ReadingsScreen />);

    await waitFor(() => expect(getByText('No readings yet')).toBeTruthy());
  });

  it('renders a ready reading with its AI tags and excerpt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetReadings.mockResolvedValue([reading({})]);

    const { getByText } = render(<ReadingsScreen />);

    await waitFor(() => expect(getByText('A flight over the ocean')).toBeTruthy());
    expect(getByText('A reading about flight and freedom.')).toBeTruthy();
    expect(getByText('Read the interpretation')).toBeTruthy();
  });

  it('shows the short-account state and its own CTA for a dream too short to interpret', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetReadings.mockResolvedValue([
      reading({ status: 'short', excerpt: null, keywords: [], confidence: null }),
    ]);

    const { getByText } = render(<ReadingsScreen />);

    await waitFor(() => expect(getByText('Not interpreted yet')).toBeTruthy());
    expect(getByText('Complete the account')).toBeTruthy();
  });

  it('shows the retry state for a dream that never got interpreted', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetReadings.mockResolvedValue([
      reading({ status: 'pending', excerpt: null, keywords: [], confidence: null }),
    ]);

    const { getByText } = render(<ReadingsScreen />);

    await waitFor(() => expect(getByText('Interpretation unavailable')).toBeTruthy());
    expect(getByText('Retry')).toBeTruthy();
  });

  it('opens a reading into the existing dream detail screen', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetReadings.mockResolvedValue([reading({ dreamId: 'dream-42' })]);

    const { getByLabelText } = render(<ReadingsScreen />);

    await waitFor(() =>
      expect(getByLabelText('Open reading: A flight over the ocean')).toBeTruthy()
    );
    fireEvent.press(getByLabelText('Open reading: A flight over the ocean'));

    expect(mockPush).toHaveBeenCalledWith('/(main)/journal/dream-42/detail');
  });

  it('refetches with the selected keyword filter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockGetTopRecurrences.mockResolvedValue([
      {
        id: 'k1',
        userId: 'user-1',
        term: 'ocean',
        patternType: 'keyword',
        occurrenceCount: 3,
        dreamIds: [],
        lastSeenAt: '2026-08-01',
      },
    ]);
    mockGetReadings.mockResolvedValue([reading({})]);

    const { getByLabelText } = render(<ReadingsScreen />);

    // "ocean" also appears as a keyword chip on the card (a11y label "Keyword:
    // ocean"); the filter chip's own label is the bare term, so this is unambiguous.
    await waitFor(() => expect(getByLabelText('ocean')).toBeTruthy());
    mockGetReadings.mockClear();
    fireEvent.press(getByLabelText('ocean'));

    await waitFor(() => expect(mockGetReadings).toHaveBeenCalledWith('user-1', 'ocean'));
  });
});
