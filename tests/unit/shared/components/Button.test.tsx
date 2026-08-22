import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '@shared/components/Button';

describe('Button', () => {
  it('renders the label', () => {
    const { getByText } = render(<Button label="Save" onPress={() => {}} />);
    expect(getByText('Save')).toBeTruthy();
  });

  it('renders the primary variant (default) without crashing', () => {
    const { getByText } = render(<Button label="Primary" onPress={() => {}} />);
    expect(getByText('Primary')).toBeTruthy();
  });

  it('renders the secondary variant without crashing', () => {
    const { getByText } = render(
      <Button label="Secondary" variant="secondary" onPress={() => {}} />
    );
    expect(getByText('Secondary')).toBeTruthy();
  });

  it('renders the ghost variant without crashing', () => {
    const { getByText } = render(<Button label="Ghost" variant="ghost" onPress={() => {}} />);
    expect(getByText('Ghost')).toBeTruthy();
  });

  it('calls onPress when enabled and pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Tap" onPress={onPress} />);
    fireEvent.press(getByText('Tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Tap" onPress={onPress} disabled />);
    fireEvent.press(getByText('Tap'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('passes through extra TouchableOpacity props', () => {
    const { getByLabelText } = render(
      <Button label="Tap" onPress={() => {}} accessibilityLabel="custom-label" />
    );
    expect(getByLabelText('custom-label')).toBeTruthy();
  });
});
