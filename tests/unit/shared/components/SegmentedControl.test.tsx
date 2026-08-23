import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { SegmentedControl } from '@shared/components/SegmentedControl';

const SEGMENTS = [
  { value: 'write', label: 'Write' },
  { value: 'dictate', label: 'Dictate' },
] as const;

describe('SegmentedControl', () => {
  it('marks only the selected segment, so a screen reader can tell them apart', () => {
    const { getByLabelText } = render(
      <SegmentedControl segments={SEGMENTS} value="write" onChange={jest.fn()} />
    );

    expect(getByLabelText('Write').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Dictate').props.accessibilityState.selected).toBe(false);
  });

  it('reports the pressed value', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <SegmentedControl segments={SEGMENTS} value="write" onChange={onChange} />
    );

    fireEvent.press(getByLabelText('Dictate'));
    expect(onChange).toHaveBeenCalledWith('dictate');
  });

  it('speaks the accessibility label when the visible one is too terse on its own', () => {
    const { getByLabelText } = render(
      <SegmentedControl
        segments={[{ value: '30', label: '30d', accessibilityLabel: 'Show the last 30 days' }]}
        value="30"
        onChange={jest.fn()}
      />
    );

    expect(getByLabelText('Show the last 30 days')).toBeTruthy();
  });
});
