import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DeleteDreamModal } from '@features/journal/DeleteDreamModal';

describe('DeleteDreamModal', () => {
  it('renders the title, body and both actions when visible', () => {
    const { getByText } = render(
      <DeleteDreamModal visible onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(getByText('Delete this dream?')).toBeTruthy();
    expect(getByText(/removed permanently/)).toBeTruthy();
    expect(getByText('Delete permanently')).toBeTruthy();
    expect(getByText('Keep the dream')).toBeTruthy();
  });

  it('calls onConfirm when "Delete permanently" is pressed', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <DeleteDreamModal visible onConfirm={onConfirm} onCancel={() => {}} />
    );
    fireEvent.press(getByText('Delete permanently'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when "Keep the dream" is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <DeleteDreamModal visible onConfirm={() => {}} onCancel={onCancel} />
    );
    fireEvent.press(getByText('Keep the dream'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not render its content when not visible', () => {
    const { queryByText } = render(
      <DeleteDreamModal visible={false} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(queryByText('Delete this dream?')).toBeNull();
  });
});
