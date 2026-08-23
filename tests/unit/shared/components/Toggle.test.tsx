import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Toggle } from '@shared/components/Toggle';
import { colors, MIN_TOUCH_TARGET } from '@theme/tokens';

describe('Toggle', () => {
  it('exposes itself as a switch with its checked state', () => {
    const { getByLabelText } = render(
      <Toggle label="Lucid dream" value onValueChange={jest.fn()} />
    );

    const control = getByLabelText('Lucid dream');
    expect(control.props.accessibilityRole).toBe('switch');
    expect(control.props.accessibilityState.checked).toBe(true);
  });

  it('reports the flipped value, not the current one', () => {
    const onValueChange = jest.fn();
    const { getByLabelText } = render(
      <Toggle label="Lucid dream" value={false} onValueChange={onValueChange} />
    );

    fireEvent.press(getByLabelText('Lucid dream'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('shows the hint as the switch description rather than as a second focus stop', () => {
    const { getByLabelText, getByText } = render(
      <Toggle
        label="Lucid dream"
        hint="You knew you were dreaming"
        value
        onValueChange={jest.fn()}
      />
    );

    expect(getByText('You knew you were dreaming')).toBeTruthy();
    expect(getByLabelText('Lucid dream').props.accessibilityHint).toBe(
      'You knew you were dreaming'
    );
  });

  it('tints with amber when highlighted — the lucid marker is one of amber\'s two uses', () => {
    const { getByLabelText } = render(
      <Toggle label="Lucid dream" value onValueChange={jest.fn()} highlight />
    );

    const style = StyleSheet.flatten(getByLabelText('Lucid dream').props.style);
    expect(style.borderColor).toBe(colors.highlight);
  });

  it('uses the accent, not amber, when it is an ordinary preference', () => {
    const { getByLabelText } = render(<Toggle label="Face ID" value onValueChange={jest.fn()} />);

    const style = StyleSheet.flatten(getByLabelText('Face ID').props.style);
    expect(style.borderColor).toBe(colors.accent);
  });

  it('holds the 44px touch floor', () => {
    const { getByLabelText } = render(
      <Toggle label="Lucid dream" value={false} onValueChange={jest.fn()} />
    );

    const style = StyleSheet.flatten(getByLabelText('Lucid dream').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
