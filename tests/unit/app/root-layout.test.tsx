import React from 'react';
import { AppState } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSegments = jest.fn(() => ['(main)']);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSegments: () => mockSegments(),
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children,
    { Screen: () => null }
  ),
}));

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockGetItem = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: jest.fn(),
}));

const mockGetSession = jest.fn();
jest.mock('@services/../supabase/client', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

const mockIsLockRequired = jest.fn();
jest.mock('@services/auth/ExpoLocalLockService', () => ({
  ExpoLocalLockService: jest.fn().mockImplementation(() => ({
    isLockRequired: (...args: unknown[]) => mockIsLockRequired(...args),
    recordAuthentication: jest.fn(),
    setIdleTimeoutMs: jest.fn(),
  })),
}));

const mockEvictToLimit = jest.fn().mockResolvedValue(undefined);
jest.mock('@services/storage/ExpoStorageService', () => ({
  ExpoStorageService: jest.fn().mockImplementation(() => ({
    evictToLimit: (...args: unknown[]) => mockEvictToLimit(...args),
  })),
}));

const mockConfigureRC = jest.fn();
jest.mock('@services/subscription/RevenueCatEntitlementService', () => ({
  RevenueCatEntitlementService: Object.assign(
    jest.fn().mockImplementation(() => ({})),
    { configure: (...args: unknown[]) => mockConfigureRC(...args) }
  ),
}));

jest.mock('@services/auth/SupabaseAuthService', () => ({
  SupabaseAuthService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/ai/interpretation/ClaudeInterpretationService', () => ({
  ClaudeInterpretationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/ai/image/OpenAIImageGenerationService', () => ({
  OpenAIImageGenerationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/ai/video/LumaVideoGenerationService', () => ({
  LumaVideoGenerationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/notifications/ExpoNotificationService', () => ({
  ExpoNotificationService: jest.fn().mockImplementation(() => ({})),
}));

import RootLayout from '@app/_layout';

describe('RootLayout / AppNavigator', () => {
  const originalRcKey = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments.mockReturnValue(['(main)']);
    mockIsLockRequired.mockReturnValue(false);
    mockGetItem.mockResolvedValue('true');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    delete process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];
  });

  afterAll(() => {
    if (originalRcKey === undefined) delete process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];
    else process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] = originalRcKey;
  });

  it('navigates to onboarding when onboarding_complete is not set', async () => {
    mockGetItem.mockResolvedValue(null);
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/onboarding/welcome'));
  });

  it('navigates to sign-in when onboarding is complete but there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in'));
  });

  it('navigates to lock when a session exists and the lock is required', async () => {
    mockIsLockRequired.mockReturnValue(true);
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/lock'));
  });

  it('navigates to the journal when a session exists and the lock is not required', async () => {
    mockIsLockRequired.mockReturnValue(false);
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(main)/journal'));
  });

  it('pushes to lock and evicts cache when the app becomes active outside (auth) while locked', async () => {
    let activeHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: (state: string) => void) => {
      activeHandler = cb;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);

    mockSegments.mockReturnValue(['(main)']);
    mockIsLockRequired.mockReturnValue(true);
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    activeHandler?.('active');

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/lock'));
    await waitFor(() => expect(mockEvictToLimit).toHaveBeenCalledWith(200 * 1024 * 1024));
  });

  it('does not push to lock when the app becomes active while already inside (auth)', async () => {
    let activeHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, cb: (state: string) => void) => {
      activeHandler = cb;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);

    mockSegments.mockReturnValue(['(auth)']);
    mockIsLockRequired.mockReturnValue(true);
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    activeHandler?.('active');

    await waitFor(() => expect(mockEvictToLimit).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('configures RevenueCat when the API key env var is set', async () => {
    process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] = 'test-rc-key';
    render(<RootLayout />);
    await waitFor(() => expect(mockConfigureRC).toHaveBeenCalledWith('test-rc-key'));
  });

  it('does not configure RevenueCat when the API key env var is absent', async () => {
    delete process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockConfigureRC).not.toHaveBeenCalled();
  });
});
