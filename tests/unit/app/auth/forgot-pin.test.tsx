import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

const mockGetUser = jest.fn();
const mockSignInWithPassword = jest.fn();
jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  },
}));

const mockSetupPin = jest.fn().mockResolvedValue(undefined);
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

import ForgotPinScreen from '@app/(auth)/forgot-pin';

// The screen resolves its lock service through useServices(), so the double is injected
// via ServicesProvider rather than by mocking the concrete class module.
function buildRegistry(): ServiceRegistry {
  const localLock = Object.assign(new MockLocalLockService(), {
    setupPin: (...args: unknown[]) => mockSetupPin(...args) as Promise<void>,
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
      <ForgotPinScreen />
    </ServicesProvider>
  );
}

describe('ForgotPinScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockBack.mockClear();
    mockSetupPin.mockClear();
    mockGetUser.mockReset();
    mockSignInWithPassword.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('renders the verify step by default', () => {
    const { getByText, getByPlaceholderText } = renderScreen();
    expect(getByText('Verify your identity')).toBeTruthy();
    expect(getByPlaceholderText('Account password')).toBeTruthy();
  });

  it('disables Verify while the password is empty', () => {
    const { getByRole } = renderScreen();
    expect(getByRole('button', { name: 'Verify' }).props.accessibilityState?.disabled).toBe(true);
  });

  it('moves to the reset step when the password is verified', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'me@example.com' } } });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const { getByText, getByPlaceholderText, findByText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Account password'), 'hunter2');
    fireEvent.press(getByText('Verify'));

    expect(await findByText('Set new PIN')).toBeTruthy();
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'me@example.com', password: 'hunter2' });
  });

  it('shows a verification-failed alert when there is no user email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { getByText, getByPlaceholderText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Account password'), 'hunter2');
    fireEvent.press(getByText('Verify'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Verification Failed', 'Incorrect password. Please try again.')
    );
  });

  it('shows a verification-failed alert when signInWithPassword errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'me@example.com' } } });
    mockSignInWithPassword.mockResolvedValue({ error: new Error('bad password') });
    const { getByText, getByPlaceholderText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Account password'), 'wrong');
    fireEvent.press(getByText('Verify'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Verification Failed', 'Incorrect password. Please try again.')
    );
  });

  it('shows a mismatch alert and does not call setupPin when PINs differ', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'me@example.com' } } });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const { getByText, getByPlaceholderText, findByText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Account password'), 'hunter2');
    fireEvent.press(getByText('Verify'));
    await findByText('Set new PIN');

    fireEvent.changeText(getByPlaceholderText('New PIN (min 4 digits)'), '1234');
    fireEvent.changeText(getByPlaceholderText('Confirm new PIN'), '4321');
    fireEvent.press(getByText('Reset PIN'));

    expect(alertSpy).toHaveBeenCalledWith('PINs Do Not Match', 'Please make sure both PINs are the same.');
    expect(mockSetupPin).not.toHaveBeenCalled();
  });

  it('resets the PIN and navigates back on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'me@example.com' } } });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const { getByText, getByPlaceholderText, findByText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Account password'), 'hunter2');
    fireEvent.press(getByText('Verify'));
    await findByText('Set new PIN');

    fireEvent.changeText(getByPlaceholderText('New PIN (min 4 digits)'), '1234');
    fireEvent.changeText(getByPlaceholderText('Confirm new PIN'), '1234');
    fireEvent.press(getByText('Reset PIN'));

    await waitFor(() => expect(mockSetupPin).toHaveBeenCalledWith('1234'));
    expect(alertSpy).toHaveBeenCalledWith(
      'PIN Updated',
      'Your PIN has been reset successfully.',
      expect.any(Array)
    );

    const okButton = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2][0];
    okButton.onPress();
    expect(mockBack).toHaveBeenCalled();
  });

  it('disables Reset PIN while the new PIN is under 4 characters', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { email: 'me@example.com' } } });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    const { getByText, getByRole, getByPlaceholderText, findByText } = renderScreen();

    fireEvent.changeText(getByPlaceholderText('Account password'), 'hunter2');
    fireEvent.press(getByText('Verify'));
    await findByText('Set new PIN');

    expect(getByRole('button', { name: 'Reset PIN' }).props.accessibilityState?.disabled).toBe(true);
  });
});
