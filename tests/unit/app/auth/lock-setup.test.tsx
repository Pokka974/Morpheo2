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

import { ServicesProvider } from '@services/ServicesProvider';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';

import OnboardingLockSetupScreen from '@app/(auth)/onboarding/lock-setup';

// The screen resolves its lock service through useServices(), so the double is injected
// via ServicesProvider rather than by mocking the concrete class module.
function buildRegistry(): ServiceRegistry {
  const localLock = Object.assign(new MockLocalLockService(), {
    setupPin: (...args: unknown[]) => mockSetupPin(...args) as Promise<void>,
    getLockMethod: (...args: unknown[]) => mockGetLockMethod(...args) as Promise<'pin'>,
  });
  return {
    auth: new MockAuthService(),
    localLock,
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
  };
}

function renderScreen() {
  return render(
    <ServicesProvider services={buildRegistry()}>
      <OnboardingLockSetupScreen />
    </ServicesProvider>
  );
}

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
    const { findByText } = renderScreen();
    expect(await findByText(/Set a PIN as a backup to Face ID/)).toBeTruthy();
  });

  it('shows the generic subtitle when biometric is not available', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { findByText } = renderScreen();
    expect(await findByText(/Create a PIN to protect your dream journal/)).toBeTruthy();
  });

  it('shows an alert and does not call setupPin when the PIN is too short', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { getByText, getByPlaceholderText } = renderScreen();
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
    const { getByText, getByPlaceholderText } = renderScreen();
    await waitFor(() => expect(mockGetLockMethod).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText('Create PIN (min 4 digits)'), '1234');
    fireEvent.changeText(getByPlaceholderText('Confirm PIN'), '4321');
    fireEvent.press(getByText('Set Up Protection'));

    expect(alertSpy).toHaveBeenCalledWith(
      'PINs Do Not Match',
      'Please make sure both PINs are the same.'
    );
    expect(mockSetupPin).not.toHaveBeenCalled();
  });

  it('sets up the PIN, marks onboarding complete, and navigates to sign-in on success', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem').mockResolvedValue();
    const { getByText, getByPlaceholderText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Create PIN (min 4 digits)'), '1234');
    fireEvent.changeText(getByPlaceholderText('Confirm PIN'), '1234');
    fireEvent.press(getByText('Set Up Protection'));

    await waitFor(() => expect(mockSetupPin).toHaveBeenCalledWith('1234'));
    expect(setItemSpy).toHaveBeenCalledWith('onboarding_complete', 'true');
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('disables Set Up Protection while the PIN is under 4 characters', async () => {
    mockGetLockMethod.mockResolvedValue('pin');
    const { getByRole } = renderScreen();
    await waitFor(() => expect(mockGetLockMethod).toHaveBeenCalled());
    expect(
      getByRole('button', { name: 'Set Up Protection' }).props.accessibilityState?.disabled
    ).toBe(true);
  });
});
