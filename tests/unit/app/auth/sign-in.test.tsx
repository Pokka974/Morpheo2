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

import SignInScreen from '@app/(auth)/sign-in';

function buildRegistry(authService: MockAuthService): ServiceRegistry {
  return {
    auth: authService,
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
  };
}

function renderScreen(authService = new MockAuthService()) {
  return render(
    <ServicesProvider services={buildRegistry(authService)}>
      <SignInScreen />
    </ServicesProvider>
  );
}

describe('SignInScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it('renders the title, both inputs and all buttons', () => {
    const { getByText, getByPlaceholderText } = renderScreen();
    expect(getByText('Welcome back')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
    expect(getByText('Continue with Google')).toBeTruthy();
    expect(getByText('Continue with Apple')).toBeTruthy();
  });

  it('disables the Sign In button while email or password is empty', () => {
    const { getByRole, getByPlaceholderText } = renderScreen();
    expect(getByRole('button', { name: 'Sign In' }).props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    expect(getByRole('button', { name: 'Sign In' }).props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(getByPlaceholderText('Password'), 'hunter2');
    expect(getByRole('button', { name: 'Sign In' }).props.accessibilityState?.disabled).toBe(false);
  });

  it('signs in with email and navigates to the journal on success', async () => {
    const authService = new MockAuthService();
    const spy = jest.spyOn(authService, 'signInWithEmail');
    const { getByText, getByPlaceholderText, queryByText } = renderScreen(authService);

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'hunter2');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
    expect(spy).toHaveBeenCalledWith('me@example.com', 'hunter2');
    expect(queryByText(/failed/i)).toBeNull();
  });

  it('shows an error message when email sign-in fails', async () => {
    const authService = new MockAuthService().configure('failure');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(authService);

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'hunter2');
    fireEvent.press(getByText('Sign In'));

    expect(await findByText('Invalid credentials')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when a non-Error is thrown from email sign-in', async () => {
    const authService = new MockAuthService();
    jest.spyOn(authService, 'signInWithEmail').mockRejectedValue('boom');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(authService);

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'hunter2');
    fireEvent.press(getByText('Sign In'));

    expect(await findByText('Sign in failed. Please try again.')).toBeTruthy();
  });

  it('shows the loading label while an email sign-in is in flight', async () => {
    const authService = new MockAuthService();
    let resolveSignIn: () => void = () => {};
    jest.spyOn(authService, 'signInWithEmail').mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSignIn = () =>
            resolve({
              user: { id: 'x', email: 'x', provider: 'email' },
              accessToken: 't',
              expiresAt: 0,
            });
        })
    );
    const { getByText, getByPlaceholderText } = renderScreen(authService);

    fireEvent.changeText(getByPlaceholderText('Email'), 'me@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'hunter2');
    fireEvent.press(getByText('Sign In'));

    expect(await waitFor(() => getByText('Signing in...'))).toBeTruthy();
    resolveSignIn();
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it('signs in with Google and navigates on success', async () => {
    const authService = new MockAuthService();
    const spy = jest.spyOn(authService, 'signInWithGoogle');
    const { getByText } = renderScreen(authService);

    fireEvent.press(getByText('Continue with Google'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
    expect(spy).toHaveBeenCalled();
  });

  it('shows a Google-specific error message on failure', async () => {
    const authService = new MockAuthService().configure('failure');
    const { getByText, findByText } = renderScreen(authService);

    fireEvent.press(getByText('Continue with Google'));

    expect(await findByText('Google sign-in failed')).toBeTruthy();
  });

  it('signs in with Apple and navigates on success', async () => {
    const authService = new MockAuthService();
    const spy = jest.spyOn(authService, 'signInWithApple');
    const { getByText } = renderScreen(authService);

    fireEvent.press(getByText('Continue with Apple'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
    expect(spy).toHaveBeenCalled();
  });

  it('shows an Apple-specific error message on failure', async () => {
    const authService = new MockAuthService().configure('failure');
    const { getByText, findByText } = renderScreen(authService);

    fireEvent.press(getByText('Continue with Apple'));

    expect(await findByText('Apple sign-in failed')).toBeTruthy();
  });

  it('navigates to sign-up when the link is pressed', () => {
    const { getByText } = renderScreen();
    fireEvent.press(getByText("Don't have an account? Create one"));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-up');
  });
});
