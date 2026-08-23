import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorState } from '@shared/components/ErrorState';

describe('ErrorState', () => {
  it('renders the message with no retry button when onRetry is absent', () => {
    const { getByText, queryByText } = render(<ErrorState message="Something broke" />);
    expect(getByText('Something broke')).toBeTruthy();
    expect(queryByText('Try again')).toBeNull();
  });

  it('renders a default "Try again" retry button and fires onRetry on press', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorState message="Something broke" onRetry={onRetry} />);
    fireEvent.press(getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a custom retry label', () => {
    const { getByText } = render(
      <ErrorState message="Something broke" onRetry={() => {}} retryLabel="Retry Now" />
    );
    expect(getByText('Retry Now')).toBeTruthy();
  });

  it('stays an unpadded inline card by default, so it can sit above a form', () => {
    const { getByText, queryByTestId } = render(<ErrorState message="Something broke" />);

    // Nothing wraps the card: it takes the width of whatever laid it out and adds no
    // vertical offset of its own, which is what a failed sign-in above a form needs.
    expect(getByText('Something broke')).toBeTruthy();
    expect(queryByTestId('error-screen')).toBeNull();
  });

  it('centres itself clear of the notch when it is the whole screen', () => {
    const metrics = {
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, left: 0, right: 0, bottom: 34 },
    };

    const { getByTestId } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ErrorState message="Something broke" fullScreen />
      </SafeAreaProvider>
    );

    const style = StyleSheet.flatten(getByTestId('error-screen').props.style);
    // Takes the height and centres, rather than letting the card sit at y=0 under
    // the status bar — which is what a screen whose entire body is an error did.
    expect(style.flex).toBe(1);
    expect(style.justifyContent).toBe('center');
    expect(style.paddingTop).toBeGreaterThan(59);
    expect(style.paddingBottom).toBeGreaterThan(34);
  });
});
