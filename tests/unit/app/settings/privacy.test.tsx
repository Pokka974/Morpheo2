import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockGetUser = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpdateEq = jest.fn();
const mockInsert = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })) })),
      update: jest.fn(() => ({ eq: mockUpdateEq })),
      insert: (...args: unknown[]) => mockInsert(...args),
    })),
  },
}));

import PrivacyScreen from '@app/(main)/settings/privacy';

describe('PrivacyScreen', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null });
    mockUpdateEq.mockReset().mockResolvedValue({});
    mockInsert.mockReset().mockResolvedValue({});
  });

  it('shows "Consent Granted" and a Withdraw button when consent is granted', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ai_consent_granted: true, ai_consent_granted_at: '2026-01-15T00:00:00.000Z' },
    });
    const { getByText } = render(<PrivacyScreen />);

    await waitFor(() => expect(getByText('Consent granted')).toBeTruthy());
    expect(getByText(/Granted \d/)).toBeTruthy();
    expect(getByText('Withdraw consent')).toBeTruthy();
  });

  it('shows "Consent Withdrawn" and a Grant button when consent is false', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ai_consent_granted: false, ai_consent_granted_at: '2026-01-15T00:00:00.000Z' },
    });
    const { getByText } = render(<PrivacyScreen />);

    await waitFor(() => expect(getByText('Consent withdrawn')).toBeTruthy());
    expect(getByText('Grant consent')).toBeTruthy();
  });

  it('with no profile data at all, renders without crashing and shows no date line', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const { getByText, queryByText } = render(<PrivacyScreen />);

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(getByText('AI data consent')).toBeTruthy();
    expect(queryByText(/Updated/)).toBeNull();
  });

  it('with no authenticated user, loadConsent returns early without crashing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { getByText } = render(<PrivacyScreen />);

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(getByText('AI data consent')).toBeTruthy();
  });

  it('pressing "Withdraw Consent" updates profiles and inserts a consent_records row', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ai_consent_granted: true, ai_consent_granted_at: '2026-01-15T00:00:00.000Z' },
    });
    const { getByText } = render(<PrivacyScreen />);
    await waitFor(() => expect(getByText('Withdraw consent')).toBeTruthy());

    fireEvent.press(getByText('Withdraw consent'));

    await waitFor(() => expect(getByText('Consent withdrawn')).toBeTruthy());
    expect(mockUpdateEq).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'revoked' }));
  });

  it('pressing "Grant Consent" updates profiles and inserts a consent_records row', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ai_consent_granted: false, ai_consent_granted_at: null },
    });
    const { getByText } = render(<PrivacyScreen />);
    await waitFor(() => expect(getByText('Grant consent')).toBeTruthy());

    fireEvent.press(getByText('Grant consent'));

    await waitFor(() => expect(getByText('Consent granted')).toBeTruthy());
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'granted' }));
  });

  it('shows a spinner while saving is in flight', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { ai_consent_granted: false, ai_consent_granted_at: null } });
    let resolveEq: (v: unknown) => void = () => {};
    mockUpdateEq.mockReturnValue(new Promise(resolve => { resolveEq = resolve; }));

    const { getByText, queryByText, UNSAFE_getByType } = render(<PrivacyScreen />);
    await waitFor(() => expect(getByText('Grant consent')).toBeTruthy());

    fireEvent.press(getByText('Grant consent'));

    await waitFor(() => {
      expect(queryByText('Grant consent')).toBeNull();
      expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
    });

    await act(async () => {
      resolveEq({});
      await Promise.resolve();
    });
  });

  it('updateConsent guards against a missing user mid-flow (isSaving still resets via finally)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { ai_consent_granted: false, ai_consent_granted_at: null } });
    const { getByText } = render(<PrivacyScreen />);
    await waitFor(() => expect(getByText('Grant consent')).toBeTruthy());

    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    fireEvent.press(getByText('Grant consent'));

    await waitFor(() => expect(getByText('Grant consent')).toBeTruthy());
    expect(mockUpdateEq).not.toHaveBeenCalled();
  });
});
