import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RecurrenceAnalyticsView } from '@features/recurrence/RecurrenceAnalyticsView';
import type { RecurrencePattern } from '@features/recurrence/recurrenceRepository';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetTopRecurrences = jest.fn();
jest.mock('@features/recurrence/recurrenceRepository', () => ({
  getTopRecurrences: (...args: unknown[]) => mockGetTopRecurrences(...args),
}));

function pattern(overrides: Partial<RecurrencePattern> = {}): RecurrencePattern {
  return {
    id: 'p1',
    userId: 'user-1',
    term: 'ocean',
    patternType: 'keyword',
    occurrenceCount: 4,
    dreamIds: ['dream-1'],
    lastSeenAt: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

describe('RecurrenceAnalyticsView', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockGetTopRecurrences.mockReset();
  });

  it('shows a loading state before data resolves', () => {
    mockGetTopRecurrences.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<RecurrenceAnalyticsView userId="user-1" />);
    expect(getByText('Loading insights...')).toBeTruthy();
  });

  it('renders both sections once keywords and emotions resolve', async () => {
    mockGetTopRecurrences.mockImplementation((_userId: string, type: string) =>
      Promise.resolve(
        type === 'keyword'
          ? [pattern({ term: 'ocean' })]
          : [pattern({ term: 'joy', patternType: 'emotion' })]
      )
    );
    const { getByText } = render(<RecurrenceAnalyticsView userId="user-1" />);
    await waitFor(() => expect(getByText('Top Symbols')).toBeTruthy());
    expect(getByText('Recurring Emotions')).toBeTruthy();
    expect(getByText('ocean')).toBeTruthy();
    expect(getByText('joy')).toBeTruthy();
  });

  it('shows the empty message when both lists are empty', async () => {
    mockGetTopRecurrences.mockResolvedValue([]);
    const { getByText } = render(<RecurrenceAnalyticsView userId="user-1" />);
    await waitFor(() =>
      expect(getByText('No recurring patterns found for this time range.')).toBeTruthy()
    );
  });

  it('re-fetches with the selected range when a range button is pressed', async () => {
    mockGetTopRecurrences.mockResolvedValue([]);
    const { getByText } = render(<RecurrenceAnalyticsView userId="user-1" />);
    await waitFor(() =>
      expect(mockGetTopRecurrences).toHaveBeenCalledWith('user-1', 'keyword', 10, 30)
    );

    mockGetTopRecurrences.mockClear();
    fireEvent.press(getByText('All Time'));

    await waitFor(() =>
      expect(mockGetTopRecurrences).toHaveBeenCalledWith('user-1', 'keyword', 10, undefined)
    );
    expect(mockGetTopRecurrences).toHaveBeenCalledWith('user-1', 'emotion', 10, undefined);
  });

  it('navigates with the keyword filter when a row is pressed', async () => {
    mockGetTopRecurrences.mockImplementation((_userId: string, type: string) =>
      Promise.resolve(type === 'keyword' ? [pattern({ term: 'ocean' })] : [])
    );
    const { getByText } = render(<RecurrenceAnalyticsView userId="user-1" />);
    await waitFor(() => expect(getByText('ocean')).toBeTruthy());
    fireEvent.press(getByText('ocean'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/journal?filterKeyword=ocean');
  });

  it('shows the empty message when the fetch rejects', async () => {
    mockGetTopRecurrences.mockRejectedValue(new Error('network error'));
    const { getByText } = render(<RecurrenceAnalyticsView userId="user-1" />);
    await waitFor(() =>
      expect(getByText('No recurring patterns found for this time range.')).toBeTruthy()
    );
  });
});
