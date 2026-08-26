import React from 'react';
import { render } from '@testing-library/react-native';

import { ClarityDots } from '@shared/components/ClarityDots';

describe('<ClarityDots />', () => {
  it('renders five dots by default', () => {
    const { getByLabelText } = render(
      <ClarityDots value={3} accessibilityLabel="Clarity: 3 of 5" />
    );
    const row = getByLabelText('Clarity: 3 of 5');
    expect(row.props.children).toHaveLength(5);
  });

  it('respects a custom max', () => {
    const { getByLabelText } = render(
      <ClarityDots value={2} max={3} accessibilityLabel="Clarity: 2 of 3" />
    );
    expect(getByLabelText('Clarity: 2 of 3').props.children).toHaveLength(3);
  });

  it('clamps a value above max rather than rendering extra filled dots', () => {
    const { getByLabelText } = render(<ClarityDots value={9} accessibilityLabel="over" />);
    expect(getByLabelText('over').props.children).toHaveLength(5);
  });
});
