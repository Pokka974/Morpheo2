import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { EmotionPicker } from '@features/dream-log/EmotionPicker';

describe('EmotionPicker', () => {
  it('shows four emotions and a reveal for the rest, rather than ten at once', () => {
    const { getByLabelText, queryByLabelText, getByText } = render(
      <EmotionPicker selected={[]} onChange={jest.fn()} />
    );

    expect(getByLabelText('Emotion: calm')).toBeTruthy();
    expect(getByLabelText('Emotion: curiosity')).toBeTruthy();
    expect(queryByLabelText('Emotion: wonder')).toBeNull();
    expect(getByText('+ 6')).toBeTruthy();
  });

  it('reveals the remaining emotions on press', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <EmotionPicker selected={[]} onChange={jest.fn()} />
    );

    fireEvent.press(getByText('+ 6'));

    expect(getByLabelText('Emotion: wonder')).toBeTruthy();
    expect(queryByText('+ 6')).toBeNull();
  });

  it('keeps an already-selected emotion visible while collapsed', () => {
    const { getByLabelText, getByText } = render(
      <EmotionPicker selected={['wonder']} onChange={jest.fn()} />
    );

    expect(getByLabelText('Emotion: wonder')).toBeTruthy();
    // One fewer chip is hidden, because the selected one was pulled forward.
    expect(getByText('+ 5')).toBeTruthy();
  });

  it('adds an unselected emotion and removes a selected one', () => {
    const onChange = jest.fn();
    const { getByLabelText, rerender } = render(
      <EmotionPicker selected={[]} onChange={onChange} />
    );

    fireEvent.press(getByLabelText('Emotion: calm'));
    expect(onChange).toHaveBeenCalledWith(['calm']);

    rerender(<EmotionPicker selected={['calm']} onChange={onChange} />);
    fireEvent.press(getByLabelText('Emotion: calm'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('exposes each chip as a checkbox carrying its own state', () => {
    const { getByLabelText } = render(<EmotionPicker selected={['calm']} onChange={jest.fn()} />);

    expect(getByLabelText('Emotion: calm').props.accessibilityRole).toBe('checkbox');
    expect(getByLabelText('Emotion: calm').props.accessibilityState.checked).toBe(true);
    expect(getByLabelText('Emotion: joy').props.accessibilityState.checked).toBe(false);
  });

  it('asks the dream-log question unless the caller supplies its own heading', () => {
    const { getByText, queryByText, rerender } = render(
      <EmotionPicker selected={[]} onChange={jest.fn()} />
    );
    expect(getByText('What you felt')).toBeTruthy();

    rerender(<EmotionPicker selected={[]} onChange={jest.fn()} heading="Emotion" />);
    expect(getByText('Emotion')).toBeTruthy();
    expect(queryByText('What you felt')).toBeNull();
  });

  describe('singleSelect', () => {
    it('replaces the current pick rather than adding to it', () => {
      const onChange = jest.fn();
      const { getByLabelText } = render(
        <EmotionPicker selected={['calm']} onChange={onChange} singleSelect alwaysExpanded />
      );

      fireEvent.press(getByLabelText('Emotion: joy'));
      expect(onChange).toHaveBeenCalledWith(['joy']);
    });

    it('still deselects when the current pick is pressed again', () => {
      const onChange = jest.fn();
      const { getByLabelText } = render(
        <EmotionPicker selected={['calm']} onChange={onChange} singleSelect alwaysExpanded />
      );

      fireEvent.press(getByLabelText('Emotion: calm'));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it('announces the chips as radios, since only one can hold', () => {
      const { getByLabelText } = render(
        <EmotionPicker selected={['calm']} onChange={jest.fn()} singleSelect alwaysExpanded />
      );

      expect(getByLabelText('Emotion: calm').props.accessibilityRole).toBe('radio');
      expect(getByLabelText('Emotion: calm').props.accessibilityState.selected).toBe(true);
      expect(getByLabelText('Emotion: joy').props.accessibilityState.selected).toBe(false);
    });
  });

  it('shows every emotion with no reveal when alwaysExpanded', () => {
    const { getByLabelText, queryByText } = render(
      <EmotionPicker selected={[]} onChange={jest.fn()} alwaysExpanded />
    );

    expect(getByLabelText('Emotion: wonder')).toBeTruthy();
    expect(queryByText('+ 6')).toBeNull();
  });
});
