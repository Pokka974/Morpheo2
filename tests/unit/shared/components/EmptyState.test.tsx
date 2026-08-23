import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '@shared/components/EmptyState';

describe('EmptyState', () => {
  it('renders a passed icon, subtitle, and CTA, and fires onCta on press', () => {
    const onCta = jest.fn();
    const { getByText, getByTestId } = render(
      <EmptyState
        icon={<Text testID="custom-icon">icon</Text>}
        title="Nothing here"
        subtitle="Try adding something"
        ctaLabel="Add"
        onCta={onCta}
      />
    );
    expect(getByTestId('custom-icon')).toBeTruthy();
    expect(getByText('Nothing here')).toBeTruthy();
    expect(getByText('Try adding something')).toBeTruthy();
    fireEvent.press(getByText('Add'));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('falls back to a drawn ring when no icon is passed', () => {
    const { queryByTestId } = render(<EmptyState title="Nothing here" />);
    expect(queryByTestId('custom-icon')).toBeNull();
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
