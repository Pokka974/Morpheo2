import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '@shared/components/EmptyState';

describe('EmptyState', () => {
  it('renders icon, subtitle, and CTA when all props are provided, and fires onCta on press', () => {
    const onCta = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="🌙"
        title="Nothing here"
        subtitle="Try adding something"
        ctaLabel="Add"
        onCta={onCta}
      />
    );
    expect(getByText('🌙')).toBeTruthy();
    expect(getByText('Nothing here')).toBeTruthy();
    expect(getByText('Try adding something')).toBeTruthy();
    fireEvent.press(getByText('Add'));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('renders only the required title when no other props are given', () => {
    const { getByText, queryByText } = render(<EmptyState title="Nothing here" />);
    expect(getByText('Nothing here')).toBeTruthy();
    expect(queryByText('Add')).toBeNull();
  });

  it('does not render the CTA when ctaLabel is given without onCta', () => {
    const { queryByText } = render(<EmptyState title="Nothing here" ctaLabel="Add" />);
    expect(queryByText('Add')).toBeNull();
  });

  it('does not render the CTA when onCta is given without ctaLabel', () => {
    const onCta = jest.fn();
    const { queryByRole } = render(<EmptyState title="Nothing here" onCta={onCta} />);
    expect(queryByRole('button')).toBeNull();
  });
});
