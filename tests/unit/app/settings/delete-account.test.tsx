import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockInvoke = jest.fn();
const mockSignOut = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: (...args: unknown[]) => mockBack(...args) }),
}));

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
  },
}));

import DeleteAccountScreen from '@app/(main)/settings/delete-account';

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    mockInvoke.mockReset().mockResolvedValue({ data: null, error: null });
    mockSignOut.mockReset().mockResolvedValue({ error: null });
    mockBack.mockClear();
  });

  it('step 1: shows the warning and moves to step 2 on "I Understand — Proceed"', () => {
    const { getByText, queryByLabelText } = render(<DeleteAccountScreen />);

    expect(getByText('This cannot be undone', { exact: false })).toBeTruthy();
    expect(queryByLabelText('Type DELETE MY ACCOUNT to confirm')).toBeNull();

    fireEvent.press(getByText('I Understand — Proceed'));

    expect(getByText('Type DELETE MY ACCOUNT to confirm', { exact: false })).toBeTruthy();
  });

  it('step 1: pressing Cancel navigates back', () => {
    const { getByText } = render(<DeleteAccountScreen />);
    fireEvent.press(getByText('Cancel'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('step 2: Confirm Delete is disabled until the exact phrase is typed (case-sensitive)', async () => {
    const { getByText, getByLabelText } = render(<DeleteAccountScreen />);
    fireEvent.press(getByText('I Understand — Proceed'));

    const input = getByLabelText('Type DELETE MY ACCOUNT to confirm');

    fireEvent.changeText(input, 'delete my account');
    fireEvent.press(getByText('Confirm Delete'));
    expect(mockInvoke).not.toHaveBeenCalled();

    fireEvent.changeText(input, 'DELETE MY ACCOUNT');
    fireEvent.press(getByText('Confirm Delete'));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
  });

  it('step 2: confirming with the exact phrase invokes account-delete, signs out, and shows the success view', async () => {
    const { getByText, getByLabelText, queryByText } = render(<DeleteAccountScreen />);
    fireEvent.press(getByText('I Understand — Proceed'));
    fireEvent.changeText(getByLabelText('Type DELETE MY ACCOUNT to confirm'), 'DELETE MY ACCOUNT');
    fireEvent.press(getByText('Confirm Delete'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith('account-delete', {
      body: { confirmation: 'DELETE MY ACCOUNT' },
    });

    await waitFor(() => expect(getByText('Account Deletion Scheduled')).toBeTruthy());
    expect(queryByText('Confirm Delete')).toBeNull();
  });

  it('step 2: shows a spinner while deleting is in flight', async () => {
    let resolveInvoke: (v: unknown) => void = () => {};
    mockInvoke.mockReturnValueOnce(new Promise(resolve => { resolveInvoke = resolve; }));

    const { getByText, getByLabelText, queryByText, UNSAFE_getByType } = render(<DeleteAccountScreen />);
    fireEvent.press(getByText('I Understand — Proceed'));
    fireEvent.changeText(getByLabelText('Type DELETE MY ACCOUNT to confirm'), 'DELETE MY ACCOUNT');
    fireEvent.press(getByText('Confirm Delete'));

    await waitFor(() => {
      expect(queryByText('Confirm Delete')).toBeNull();
      expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
    });

    await act(async () => {
      resolveInvoke({ data: null, error: null });
      await Promise.resolve();
    });
  });

  it('step 2: pressing Back returns to step 1', () => {
    const { getByText, queryByLabelText } = render(<DeleteAccountScreen />);
    fireEvent.press(getByText('I Understand — Proceed'));
    fireEvent.press(getByText('Back'));

    expect(queryByLabelText('Type DELETE MY ACCOUNT to confirm')).toBeNull();
    expect(getByText('This cannot be undone', { exact: false })).toBeTruthy();
  });
});
