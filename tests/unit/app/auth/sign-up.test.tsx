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
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), navigate: jest.fn() }),
}));

import SignUpScreen from '@app/(auth)/sign-up';

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
      <SignUpScreen />
    </ServicesProvider>
  );
}

function fillForm(getByPlaceholderText: any, email: string, password: string, confirm: string) {
  fireEvent.changeText(getByPlaceholderText('Email'), email);
  fireEvent.changeText(getByPlaceholderText('Password (min 8 characters)'), password);
  fireEvent.changeText(getByPlaceholderText('Confirm password'), confirm);
}

describe('SignUpScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('renders the title and all three inputs', () => {
    const { getByText, getByPlaceholderText } = renderScreen();
    expect(getByText('Create your account')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password (min 8 characters)')).toBeTruthy();
    expect(getByPlaceholderText('Confirm password')).toBeTruthy();
  });

  it('disables Create Account while any field is empty', () => {
    const { getByRole, getByPlaceholderText } = renderScreen();
    expect(getByRole('button', { name: 'Create Account' }).props.accessibilityState?.disabled).toBe(
      true
    );
    fillForm(getByPlaceholderText, 'me@example.com', 'password123', 'password123');
    expect(getByRole('button', { name: 'Create Account' }).props.accessibilityState?.disabled).toBe(
      false
    );
  });

  it('shows a mismatch error and does not call signUp when passwords differ', async () => {
    const authService = new MockAuthService();
    const spy = jest.spyOn(authService, 'signUp');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(authService);

    fillForm(getByPlaceholderText, 'me@example.com', 'password123', 'password124');
    fireEvent.press(getByText('Create Account'));

    expect(await findByText('Passwords do not match.')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a too-short error and does not call signUp when password is under 8 characters', async () => {
    const authService = new MockAuthService();
    const spy = jest.spyOn(authService, 'signUp');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(authService);

    fillForm(getByPlaceholderText, 'me@example.com', 'short1', 'short1');
    fireEvent.press(getByText('Create Account'));

    expect(await findByText('Password must be at least 8 characters.')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('signs up and navigates to the journal on success', async () => {
    const authService = new MockAuthService();
    const spy = jest.spyOn(authService, 'signUp');
    const { getByText, getByPlaceholderText } = renderScreen(authService);

    fillForm(getByPlaceholderText, 'me@example.com', 'password123', 'password123');
    fireEvent.press(getByText('Create Account'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
    expect(spy).toHaveBeenCalledWith('me@example.com', 'password123');
  });

  it('shows an error message when account creation fails', async () => {
    const authService = new MockAuthService().configure('failure');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(authService);

    fillForm(getByPlaceholderText, 'me@example.com', 'password123', 'password123');
    fireEvent.press(getByText('Create Account'));

    expect(await findByText('Sign-up failed')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when a non-Error is thrown', async () => {
    const authService = new MockAuthService();
    jest.spyOn(authService, 'signUp').mockRejectedValue('boom');
    const { getByText, getByPlaceholderText, findByText } = renderScreen(authService);

    fillForm(getByPlaceholderText, 'me@example.com', 'password123', 'password123');
    fireEvent.press(getByText('Create Account'));

    expect(await findByText('Account creation failed.')).toBeTruthy();
  });
});
