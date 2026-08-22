import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
}));

const mockSetupPin = jest.fn().mockResolvedValue(undefined);
const mockGetLockMethod = jest.fn();
jest.mock('@services/auth/ExpoLocalLockService', () => ({
  ExpoLocalLockService: jest.fn().mockImplementation(() => ({
    setupPin: (...args: unknown[]) => mockSetupPin(...args),
    getLockMethod: (...args: unknown[]) => mockGetLockMethod(...args),
  })),
}));

import OnboardingLockSetupScreen from '@app/(auth)/onboarding/lock-setup';

describe('OnboardingLockSetupScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockClear();
    mockSetupPin.mockClear();
    mockGetLockMethod.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows the biometric-aware subtitle when biometric is available', async () => {
    mockGetLockMethod.mockResolvedValue('biometric');
    const { findByText } = render(<OnboardingLockSetupScreen />);
    expect(await findByText(/Set a PIN as a backup to Face ID/)).toBeTruthy();
  });

  it('shows the generic subtitle when biometric is not available', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { findByText } = render(<OnboardingLockSetupScreen />);
    expect(await findByText(/Create a PIN to protect your dream journal/)).toBeTruthy();
  });

  it('shows an alert and does not call setupPin when the PIN is too short', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { getByText, getByPlaceholderText } = render(<OnboardingLockSetupScreen />);
    await waitFor(() => expect(mockGetLockMethod).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText('Create PIN (min 4 digits)'), '12');
    // The button is legitimately disabled at 2 chars, so walk up to the TouchableOpacity
    // and invoke its onPress directly (bypassing the Pressability disabled-guard) to
    // exercise this internal validation branch.
    let el: any = getByText('Set Up Protection');
    while (el && typeof el.props.onPress !== 'function') {
      el = el.parent;
    }
    await el.props.onPress();

    expect(alertSpy).toHaveBeenCalledWith('PIN Too Short', 'Please enter at least 4 digits.');
    expect(mockSetupPin).not.toHaveBeenCalled();
  });

  it('shows an alert and does not call setupPin when PINs do not match', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { getByText, getByPlaceholderText } = render(<OnboardingLockSetupScreen />);
    await waitFor(() => expect(mockGetLockMethod).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText('Create PIN (min 4 digits)'), '1234');
    fireEvent.changeText(getByPlaceholderText('Confirm PIN'), '4321');
    fireEvent.press(getByText('Set Up Protection'));

    expect(alertSpy).toHaveBeenCalledWith('PINs Do Not Match', 'Please make sure both PINs are the same.');
    expect(mockSetupPin).not.toHaveBeenCalled();
  });

  it('sets up the PIN, marks onboarding complete, and navigates to sign-in on success', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockResolvedValue();
    const { getByText, getByPlaceholderText } = render(<OnboardingLockSetupScreen />);

    fireEvent.changeText(getByPlaceholderText('Create PIN (min 4 digits)'), '1234');
    fireEvent.changeText(getByPlaceholderText('Confirm PIN'), '1234');
    fireEvent.press(getByText('Set Up Protection'));

    await waitFor(() => expect(mockSetupPin).toHaveBeenCalledWith('1234'));
    expect(setItemSpy).toHaveBeenCalledWith('onboarding_complete', 'true');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('disables Set Up Protection while the PIN is under 4 characters', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { getByRole } = render(<OnboardingLockSetupScreen />);
    await waitFor(() => expect(mockGetLockMethod).toHaveBeenCalled());
    expect(getByRole('button', { name: 'Set Up Protection' }).props.accessibilityState?.disabled).toBe(true);
  });
});
