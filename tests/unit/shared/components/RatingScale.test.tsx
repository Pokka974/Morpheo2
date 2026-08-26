import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { RatingScale } from '@shared/components/RatingScale';

function flatten(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : ((style ?? {}) as Record<string, unknown>);
}

describe('<RatingScale />', () => {
  it('renders 5 steps by default, each selectable', () => {
    const onChange = jest.fn();
    const { getAllByRole } = render(
      <RatingScale label="Clarity" value={null} onChange={onChange} variant="bar" />
    );

    const steps = getAllByRole('button');
    expect(steps).toHaveLength(5);
    fireEvent.press(steps[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('marks every step up to and including the current value as selected', () => {
    const { getAllByRole } = render(
      <RatingScale label="Clarity" value={3} onChange={jest.fn()} variant="bar" />
    );
    const steps = getAllByRole('button');
    expect(steps.map(s => s.props.accessibilityState.selected)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('the bar variant stretches every segment to share the row equally (flex: 1), unlike the dot variant', () => {
    const { getAllByRole: getBarSteps } = render(
      <RatingScale label="Clarity" value={2} onChange={jest.fn()} variant="bar" />
    );
    for (const step of getBarSteps('button')) {
      expect(flatten(step.props.style).flex).toBe(1);
    }

    const { getAllByRole: getDotSteps } = render(
      <RatingScale label="Sleep quality" value={2} onChange={jest.fn()} variant="dot" />
    );
    for (const step of getDotSteps('button')) {
      expect(flatten(step.props.style).flex).toBeUndefined();
    }
  });

  it('supports a custom step count', () => {
    const { getAllByRole } = render(
      <RatingScale label="Custom" value={null} onChange={jest.fn()} max={3} />
    );
    expect(getAllByRole('button')).toHaveLength(3);
  });
});
