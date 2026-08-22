import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorState } from '@shared/components/ErrorState';

describe('ErrorState', () => {
  it('renders the message with no retry button when onRetry is absent', () => {
    const { getByText, queryByText } = render(<ErrorState message="Something broke" />);
    expect(getByText('Something broke')).toBeTruthy();
    expect(queryByText('Try Again')).toBeNull();
  });

  it('renders a default "Try Again" retry button and fires onRetry on press', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorState message="Something broke" onRetry={onRetry} />);
    fireEvent.press(getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a custom retry label', () => {
    const { getByText } = render(
      <ErrorState message="Something broke" onRetry={() => {}} retryLabel="Retry Now" />
    );
    expect(getByText('Retry Now')).toBeTruthy();
  });
});
