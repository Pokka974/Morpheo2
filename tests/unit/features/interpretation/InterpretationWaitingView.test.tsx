import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

import { InterpretationWaitingView } from '@features/interpretation/InterpretationWaitingView';

describe('InterpretationWaitingView', () => {
  it('names the dream and lists the three pipeline stages', () => {
    const { getByText } = render(
      <InterpretationWaitingView dreamTitle="The hotel corridor of named doors" />
    );

    expect(getByText('Interpretation in progress')).toBeTruthy();
    expect(getByText('The hotel corridor of named doors')).toBeTruthy();
    expect(getByText('Account read')).toBeTruthy();
    expect(getByText('Spotting the symbols')).toBeTruthy();
    expect(getByText('Crossing with your recurring themes')).toBeTruthy();
  });

  it('says how many previous dreams the reading is crossed with', () => {
    const { getByText } = render(<InterpretationWaitingView previousDreamCount={84} />);

    expect(
      getByText('One moment — we are reading your account alongside your 84 previous dreams.')
    ).toBeTruthy();
  });

  it('drops the count from the copy for a first dream, rather than saying "0 previous"', () => {
    const { getByText } = render(<InterpretationWaitingView previousDreamCount={0} />);

    expect(getByText('One moment — we are reading your account closely.')).toBeTruthy();
  });

  it('singularises the count for a second dream', () => {
    const { getByText } = render(<InterpretationWaitingView previousDreamCount={1} />);

    expect(
      getByText('One moment — we are reading your account alongside your 1 previous dream.')
    ).toBeTruthy();
  });

  it('shows the model and expected duration when a model is given', () => {
    const { getByText } = render(<InterpretationWaitingView modelLabel="claude-sonnet-4-6" />);

    expect(getByText('claude-sonnet-4-6 · ~15 s')).toBeTruthy();
  });

  it('omits the escape hatches entirely when no handler is supplied', () => {
    const { queryByLabelText, queryByText } = render(<InterpretationWaitingView />);

    expect(queryByText('Continue in the background')).toBeNull();
    expect(queryByLabelText('Cancel')).toBeNull();
  });

  it('wires the dismiss and continue-in-background actions', () => {
    const onCancel = jest.fn();
    const onContinueInBackground = jest.fn();
    const { getByLabelText, getByText } = render(
      <InterpretationWaitingView
        onCancel={onCancel}
        onContinueInBackground={onContinueInBackground}
      />
    );

    fireEvent.press(getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Continue in the background'));
    expect(onContinueInBackground).toHaveBeenCalledTimes(1);
  });

  it('advances through the stages and then stops, rather than looping back to the start', () => {
    jest.useFakeTimers();
    try {
      const view = render(<InterpretationWaitingView />);

      // Far past the point where all three stages have been narrated: the last stage
      // must still be the active one, never wrap around to the first.
      act(() => {
        jest.advanceTimersByTime(60_000);
      });

      expect(view.getByText('Crossing with your recurring themes')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
