import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { RecordingBar } from '@features/dream-log/RecordingBar';

describe('RecordingBar', () => {
  it('formats the elapsed time as minutes and padded seconds', () => {
    const { getByText, rerender } = render(
      <RecordingBar elapsedSeconds={42} onStop={jest.fn()} />
    );
    expect(getByText('0:42')).toBeTruthy();

    rerender(<RecordingBar elapsedSeconds={65} onStop={jest.fn()} />);
    expect(getByText('1:05')).toBeTruthy();
  });

  it('stops on press', () => {
    const onStop = jest.fn();
    const { getByLabelText } = render(<RecordingBar elapsedSeconds={0} onStop={onStop} />);

    fireEvent.press(getByLabelText('Stop voice dictation'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('spells the timer out for a screen reader instead of leaving it as "0:42"', () => {
    const { getByLabelText } = render(<RecordingBar elapsedSeconds={42} onStop={jest.fn()} />);

    expect(getByLabelText('Recording, 0:42 elapsed')).toBeTruthy();
  });
});
