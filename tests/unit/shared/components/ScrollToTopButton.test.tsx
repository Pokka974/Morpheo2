import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScrollToTopButton } from '@shared/components/ScrollToTopButton';

describe('ScrollToTopButton', () => {
  it('renders when visible', () => {
    const { getByLabelText } = render(
      <ScrollToTopButton visible onPress={() => {}} bottomOffset={40} />
    );
    expect(getByLabelText('Scroll to top')).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    const { queryByLabelText } = render(
      <ScrollToTopButton visible={false} onPress={() => {}} bottomOffset={40} />
    );
    expect(queryByLabelText('Scroll to top')).toBeNull();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ScrollToTopButton visible onPress={onPress} bottomOffset={40} />
    );
    fireEvent.press(getByLabelText('Scroll to top'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('animates back into view when it reappears after being hidden', () => {
    const HIDDEN = { includeHiddenElements: true } as const;
    const { queryByLabelText, rerender } = render(
      <ScrollToTopButton visible={false} onPress={() => {}} bottomOffset={40} />
    );
    // Hidden from assistive tech and touch while faded out, but stays mounted so the
    // reappearance below can animate in rather than popping.
    expect(queryByLabelText('Scroll to top', HIDDEN)).toBeTruthy();
    expect(queryByLabelText('Scroll to top')).toBeNull();

    rerender(<ScrollToTopButton visible onPress={() => {}} bottomOffset={40} />);
    expect(queryByLabelText('Scroll to top')).toBeTruthy();
  });
});
