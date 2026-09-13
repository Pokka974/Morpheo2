import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetUser = jest.fn();
const mockProfilesUpdateEq = jest.fn();
const mockConsentRecordsInsert = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return { update: () => ({ eq: (...args: unknown[]) => mockProfilesUpdateEq(...args) }) };
      }
      if (table === 'consent_records') {
        return { insert: (...args: unknown[]) => mockConsentRecordsInsert(...args) };
      }
      throw new Error(`onboarding-consent.test: unexpected table "${table}"`);
    }),
  },
}));

import OnboardingConsentScreen from '@app/(auth)/onboarding/consent';

describe('OnboardingConsentScreen error branches', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockClear();
    mockGetUser.mockReset();
    mockProfilesUpdateEq.mockReset();
    mockConsentRecordsInsert.mockReset();
    mockProfilesUpdateEq.mockResolvedValue({ error: null });
    mockConsentRecordsInsert.mockResolvedValue({ error: null });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('saves consent and advances to lock-setup on the happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const { getByText } = render(<OnboardingConsentScreen />);

    fireEvent.press(getByText('I Agree'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/lock-setup'));
    expect(mockProfilesUpdateEq).toHaveBeenCalledWith('id', 'user-1');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows an error alert and does not navigate when the profile update fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfilesUpdateEq.mockResolvedValue({ error: { message: 'db down' } });
    const { getByText } = render(<OnboardingConsentScreen />);

    fireEvent.press(getByText('I Agree'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Could not save your consent. Please try again or contact support.'
      )
    );
    expect(mockPush).not.toHaveBeenCalled();
    // The consent_records audit row must never be written on top of a profile update
    // that did not actually take — the function returns before reaching it.
    expect(mockConsentRecordsInsert).not.toHaveBeenCalled();
  });

  it('shows a generic error alert and does not navigate when getUser throws', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'));
    const { getByText } = render(<OnboardingConsentScreen />);

    fireEvent.press(getByText('I Agree'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Error', 'Something went wrong. Please try again.')
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('re-enables the Agree button after a failure, so the user can retry', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockProfilesUpdateEq.mockResolvedValue({ error: { message: 'db down' } });
    const { getByText, getByRole } = render(<OnboardingConsentScreen />);

    fireEvent.press(getByText('I Agree'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(getByRole('button', { name: 'I Agree' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('still advances to lock-setup when there is no active session, skipping the profile write', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { getByText } = render(<OnboardingConsentScreen />);

    fireEvent.press(getByText('I Agree'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/lock-setup'));
    expect(mockProfilesUpdateEq).not.toHaveBeenCalled();
  });

  it('logs but does not block navigation when only the consent_records audit insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockConsentRecordsInsert.mockResolvedValue({ error: { message: 'insert failed' } });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(<OnboardingConsentScreen />);

    fireEvent.press(getByText('I Agree'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/onboarding/lock-setup'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Consent record insert failed:',
      expect.objectContaining({ message: 'insert failed' })
    );
    consoleErrorSpy.mockRestore();
  });
});
