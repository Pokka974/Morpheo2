import React from 'react';
import { AppState } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSegments = jest.fn(() => ['(main)']);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSegments: () => mockSegments(),
  Stack: Object.assign(({ children }: { children?: React.ReactNode }) => children, {
    Screen: () => null,
  }),
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default
);

const mockGetItem = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: jest.fn(),
}));

const mockGetSession = jest.fn();
jest.mock('@services/../supabase/client', () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

const mockNetInfoAddEventListener = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (...args: unknown[]) => mockNetInfoAddEventListener(...args) },
}));

const mockSyncPendingDreams = jest.fn();
jest.mock('@features/dream-log/syncService', () => ({
  AuthExpiredError: class AuthExpiredError extends Error {},
  syncPendingDreams: (...args: unknown[]) => mockSyncPendingDreams(...args),
}));

const mockPullRemoteChanges = jest.fn();
jest.mock('@features/sync/pullService', () => ({
  pullRemoteChanges: (...args: unknown[]) => mockPullRemoteChanges(...args),
}));

const mockAuthServiceGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();

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
  SupabaseAuthService: jest.fn().mockImplementation(() => ({
    getSession: (...args: unknown[]) => mockAuthServiceGetSession(...args),
    onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
  })),
}));
jest.mock('@services/ai/interpretation/ClaudeInterpretationService', () => ({
  ClaudeInterpretationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/ai/image/FluxImageGenerationService', () => ({
  FluxImageGenerationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/ai/video/LumaVideoGenerationService', () => ({
  LumaVideoGenerationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@services/notifications/ExpoNotificationService', () => ({
  ExpoNotificationService: jest.fn().mockImplementation(() => ({
    registerPushToken: jest.fn().mockResolvedValue(undefined),
  })),
}));

import RootLayout from '@app/_layout';

describe('RootLayout / AppNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments.mockReturnValue(['(main)']);
    mockIsLockRequired.mockReturnValue(false);
    mockGetItem.mockResolvedValue('true');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockNetInfoAddEventListener.mockReturnValue(jest.fn());
    mockOnAuthStateChange.mockReturnValue(jest.fn());
    mockSyncPendingDreams.mockResolvedValue(undefined);
    mockPullRemoteChanges.mockResolvedValue(undefined);
    // No session by default, so the foreground/reconnect/login sync hooks are no-ops
    // for the existing lock/navigation/cache-eviction tests below; the dedicated
    // foreground-sync test overrides this.
    mockAuthServiceGetSession.mockResolvedValue(null);
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
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (state: string) => void
    ) => {
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
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (state: string) => void
    ) => {
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

  // Which env var holds the key, and whether it is a usable one, is RevenueCat's own
  // concern and is asserted in RevenueCatEntitlementService.test.ts. The layout's only
  // responsibility is to ask, once, on mount.
  it('configures RevenueCat on mount', async () => {
    render(<RootLayout />);
    await waitFor(() => expect(mockConfigureRC).toHaveBeenCalledTimes(1));
  });

  it('pushes pending dreams then pulls remote changes when the app foregrounds with an active session', async () => {
    let activeHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (state: string) => void
    ) => {
      activeHandler = cb;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);

    mockAuthServiceGetSession.mockResolvedValue({
      user: { id: 'u1' },
      accessToken: 't',
      expiresAt: 0,
    });
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    activeHandler?.('active');

    await waitFor(() => expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockPullRemoteChanges).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          getSignedUrl: expect.any(Function),
          cacheMedia: expect.any(Function),
        })
      )
    );
  });

  it('does not push or pull on foreground when there is no active session', async () => {
    let activeHandler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      cb: (state: string) => void
    ) => {
      activeHandler = cb;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);

    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    activeHandler?.('active');

    await waitFor(() => expect(mockEvictToLimit).toHaveBeenCalled());
    expect(mockSyncPendingDreams).not.toHaveBeenCalled();
    expect(mockPullRemoteChanges).not.toHaveBeenCalled();
  });
});
