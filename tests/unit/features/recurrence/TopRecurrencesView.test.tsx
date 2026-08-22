import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TopRecurrencesView } from '@features/recurrence/TopRecurrencesView';
import type { RecurrencePattern } from '@features/recurrence/recurrenceRepository';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function pattern(overrides: Partial<RecurrencePattern> = {}): RecurrencePattern {
  return {
    id: 'p1',
    userId: 'user-1',
    term: 'ocean',
    patternType: 'keyword',
    occurrenceCount: 3,
    dreamIds: ['dream-1'],
    lastSeenAt: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

describe('TopRecurrencesView', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders nothing when both keywords and emotions are empty', () => {
    const { toJSON } = render(<TopRecurrencesView keywords={[]} emotions={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders keyword chips with the 🔮 icon', () => {
    const { getByText } = render(
      <TopRecurrencesView keywords={[pattern({ term: 'ocean' })]} emotions={[]} />
    );
    expect(getByText('🔮')).toBeTruthy();
    expect(getByText('ocean')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('renders emotion chips with the 💭 icon', () => {
    const { getByText } = render(
      <TopRecurrencesView
        keywords={[]}
        emotions={[pattern({ term: 'joy', patternType: 'emotion' })]}
      />
    );
    expect(getByText('💭')).toBeTruthy();
    expect(getByText('joy')).toBeTruthy();
  });

  it('navigates with the keyword filter when a keyword chip is pressed', () => {
    const { getByText } = render(
      <TopRecurrencesView keywords={[pattern({ term: 'ocean' })]} emotions={[]} />
    );
    fireEvent.press(getByText('ocean'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/journal?filterKeyword=ocean');
  });

  it('navigates with the emotion filter when an emotion chip is pressed', () => {
    const { getByText } = render(
      <TopRecurrencesView
        keywords={[]}
        emotions={[pattern({ term: 'joy', patternType: 'emotion' })]}
      />
    );
    fireEvent.press(getByText('joy'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/journal?filterEmotion=joy');
  });
});
