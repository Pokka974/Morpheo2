import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AnotherAngleSheet } from '@features/journal/AnotherAngleSheet';

describe('AnotherAngleSheet', () => {
  it('renders the title, body and all three reading styles when visible', () => {
    const { getByText } = render(
      <AnotherAngleSheet
        visible
        selectedStyle="symbolic"
        onSelectStyle={() => {}}
        interpretationsRemaining={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(getByText('Suggest another angle')).toBeTruthy();
    expect(getByText(/first reading stays/)).toBeTruthy();
    expect(getByText('Symbolic / Archetypal')).toBeTruthy();
    expect(getByText('Mythological / Cultural')).toBeTruthy();
    expect(getByText('Psychological / Jungian')).toBeTruthy();
  });

  it('calls onSelectStyle with the pressed style', () => {
    const onSelectStyle = jest.fn();
    const { getByText } = render(
      <AnotherAngleSheet
        visible
        selectedStyle="symbolic"
        onSelectStyle={onSelectStyle}
        interpretationsRemaining={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    fireEvent.press(getByText('Mythological / Cultural'));
    expect(onSelectStyle).toHaveBeenCalledWith('mythological');
  });

  it('calls onConfirm/onCancel from the two actions', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(
      <AnotherAngleSheet
        visible
        selectedStyle="symbolic"
        onSelectStyle={() => {}}
        interpretationsRemaining={2}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.press(getByText('Read from this angle'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.press(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the plural caption for a count other than one', () => {
    const { getByText } = render(
      <AnotherAngleSheet
        visible
        selectedStyle="symbolic"
        onSelectStyle={() => {}}
        interpretationsRemaining={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(getByText('2 readings left this month')).toBeTruthy();
  });

  it('hides the caption entirely when interpretationsRemaining is null (unlimited/premium)', () => {
    const { queryByText } = render(
      <AnotherAngleSheet
        visible
        selectedStyle="symbolic"
        onSelectStyle={() => {}}
        interpretationsRemaining={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(queryByText(/left this month/)).toBeNull();
  });

  it('does not render its content when not visible', () => {
    const { queryByText } = render(
      <AnotherAngleSheet
        visible={false}
        selectedStyle="symbolic"
        onSelectStyle={() => {}}
        interpretationsRemaining={2}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(queryByText('Suggest another angle')).toBeNull();
  });
});
