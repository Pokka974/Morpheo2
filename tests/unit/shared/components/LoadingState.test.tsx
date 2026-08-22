import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadingState } from '@shared/components/LoadingState';

describe('LoadingState', () => {
  it('renders only the spinner when no message is given', () => {
    const { queryByText } = render(<LoadingState />);
    expect(queryByText(/./)).toBeNull();
  });

  it('renders the message when given', () => {
    const { getByText } = render(<LoadingState message="Loading dreams..." />);
    expect(getByText('Loading dreams...')).toBeTruthy();
  });
});
