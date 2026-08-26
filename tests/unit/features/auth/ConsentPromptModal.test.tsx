import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ConsentPromptModal } from '@features/auth/ConsentPromptModal';

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

const { supabase } = require('@services/../supabase/client');

describe('ConsentPromptModal', () => {
  beforeEach(() => {
    supabase.auth.getUser.mockReset();
    supabase.from.mockReset();
  });

  it('renders title, body, and both buttons when visible', () => {
    const { getByText } = render(
      <ConsentPromptModal visible={true} onGranted={() => {}} onDismiss={() => {}} />
    );
    expect(getByText('Enable AI Interpretation')).toBeTruthy();
    expect(getByText(/Anthropic/)).toBeTruthy();
    expect(getByText(/Black Forest Labs/)).toBeTruthy();
    expect(getByText('Grant Consent')).toBeTruthy();
    expect(getByText('Not Now')).toBeTruthy();
  });

  it('writes consent records and calls onGranted when a user is present', async () => {
    const mockEq = jest.fn().mockResolvedValue({});
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockInsert = jest.fn().mockResolvedValue({});
    supabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') return { update: mockUpdate };
      if (table === 'consent_records') return { insert: mockInsert };
      return {};
    });
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const onGranted = jest.fn();
    const { getByText } = render(
      <ConsentPromptModal visible={true} onGranted={onGranted} onDismiss={() => {}} />
    );

    fireEvent.press(getByText('Grant Consent'));

    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ ai_consent_granted: true }));
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
    expect(mockInsert).toHaveBeenCalledWith({ user_id: 'user-1', action: 'granted' });
  });

  it('calls onGranted without writing records when no user is returned', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const onGranted = jest.fn();
    const { getByText } = render(
      <ConsentPromptModal visible={true} onGranted={onGranted} onDismiss={() => {}} />
    );

    fireEvent.press(getByText('Grant Consent'));

    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('still calls onGranted when supabase throws', async () => {
    supabase.auth.getUser.mockRejectedValue(new Error('network error'));
    const onGranted = jest.fn();
    const { getByText } = render(
      <ConsentPromptModal visible={true} onGranted={onGranted} onDismiss={() => {}} />
    );

    fireEvent.press(getByText('Grant Consent'));

    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1));
  });

  it('calls onDismiss and makes no supabase calls when Not Now is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <ConsentPromptModal visible={true} onGranted={() => {}} onDismiss={onDismiss} />
    );

    fireEvent.press(getByText('Not Now'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });
});
