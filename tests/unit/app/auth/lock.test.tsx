import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, navigate: jest.fn() }),
}));

import LockScreen from '@app/(auth)/lock';

function buildRegistry(localLock: MockLocalLockService): ServiceRegistry {
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

function renderScreen(localLock = new MockLocalLockService()) {
  return render(
    <ServicesProvider services={buildRegistry(localLock)}>
      <LockScreen />
    </ServicesProvider>
  );
}

describe('LockScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it('auto-navigates to the journal when biometric authentication succeeds on mount', async () => {
    const localLock = new MockLocalLockService().configure('success');
    renderScreen(localLock);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
  });

  it('stays on the lock screen and shows the PIN entry when biometric authentication fails on mount', async () => {
    const localLock = new MockLocalLockService().configure('failure');
    const { getByPlaceholderText } = renderScreen(localLock);

    await waitFor(() => expect(getByPlaceholderText('Enter PIN')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('disables Unlock while the PIN is under 4 characters', async () => {
    const localLock = new MockLocalLockService().configure('failure');
    const { getByRole, getByPlaceholderText } = renderScreen(localLock);
    await waitFor(() => expect(getByPlaceholderText('Enter PIN')).toBeTruthy());

    expect(getByRole('button', { name: 'Unlock' }).props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(getByPlaceholderText('Enter PIN'), '123');
    expect(getByRole('button', { name: 'Unlock' }).props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(getByPlaceholderText('Enter PIN'), '1234');
    expect(getByRole('button', { name: 'Unlock' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('navigates to the journal when the correct PIN is submitted', async () => {
    const localLock = new MockLocalLockService().configure('failure');
    const { getByText, getByPlaceholderText } = renderScreen(localLock);
    await waitFor(() => expect(getByPlaceholderText('Enter PIN')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Enter PIN'), '1234');
    jest.spyOn(localLock, 'verifyPin').mockResolvedValue(true);
    fireEvent.press(getByText('Unlock'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
  });

  it('shows an error and clears the PIN when the wrong PIN is submitted', async () => {
    const localLock = new MockLocalLockService().configure('failure');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(localLock);
    await waitFor(() => expect(getByPlaceholderText('Enter PIN')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Enter PIN'), '9999');
    fireEvent.press(getByText('Unlock'));

    expect(await findByText('Incorrect PIN. Please try again.')).toBeTruthy();
    expect(getByPlaceholderText('Enter PIN').props.value).toBe('');
  });

  it('retries biometric auth when the Face ID / Touch ID link is pressed', async () => {
    const localLock = new MockLocalLockService().configure('failure');
    const { getByText, getByPlaceholderText } = renderScreen(localLock);
    await waitFor(() => expect(getByPlaceholderText('Enter PIN')).toBeTruthy());

    const spy = jest.spyOn(localLock, 'authenticate').mockResolvedValue(true);
    fireEvent.press(getByText('Use Face ID / Touch ID'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
    expect(spy).toHaveBeenCalledWith('Unlock your dream journal');
  });

  it('navigates to forgot-pin when the link is pressed', async () => {
    const localLock = new MockLocalLockService().configure('failure');
    const { getByText, getByPlaceholderText } = renderScreen(localLock);
    await waitFor(() => expect(getByPlaceholderText('Enter PIN')).toBeTruthy());

    fireEvent.press(getByText('Forgot PIN?'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-pin');
  });
});
