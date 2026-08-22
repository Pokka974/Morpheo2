import { renderHook } from '@testing-library/react-native';
import { useAuthSync } from '@features/auth/useAuthSync';
import type { AuthService, AuthSession } from '@services/auth/AuthService';
import type { NotificationService } from '@services/notifications/NotificationService';

const session: AuthSession = {
  user: { id: 'user-1', email: 'a@b.com', provider: 'email' },
  accessToken: 'token',
  expiresAt: Date.now() / 1000 + 3600,
};

describe('useAuthSync', () => {
  it('registers a push token when the auth state change carries a session', async () => {
    const unsubscribe = jest.fn();
    let capturedCallback: (session: AuthSession | null) => void = () => {};
    const auth = {
      onAuthStateChange: jest.fn((cb: (s: AuthSession | null) => void) => {
        capturedCallback = cb;
        return unsubscribe;
      }),
    } as unknown as AuthService;
    const registerPushToken = jest.fn().mockResolvedValue(undefined);
    const notifications = { registerPushToken } as unknown as NotificationService;

    renderHook(() => useAuthSync(auth, notifications));

    await capturedCallback(session);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });

  it('does not register a push token when the session is null', async () => {
    const unsubscribe = jest.fn();
    let capturedCallback: (session: AuthSession | null) => void = () => {};
    const auth = {
      onAuthStateChange: jest.fn((cb: (s: AuthSession | null) => void) => {
        capturedCallback = cb;
        return unsubscribe;
      }),
    } as unknown as AuthService;
    const registerPushToken = jest.fn().mockResolvedValue(undefined);
    const notifications = { registerPushToken } as unknown as NotificationService;

    renderHook(() => useAuthSync(auth, notifications));

    await capturedCallback(null);
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('swallows a registerPushToken failure without throwing', async () => {
    const unsubscribe = jest.fn();
    let capturedCallback: (session: AuthSession | null) => void = () => {};
    const auth = {
      onAuthStateChange: jest.fn((cb: (s: AuthSession | null) => void) => {
        capturedCallback = cb;
        return unsubscribe;
      }),
    } as unknown as AuthService;
    const registerPushToken = jest.fn().mockRejectedValue(new Error('push registration failed'));
    const notifications = { registerPushToken } as unknown as NotificationService;

    renderHook(() => useAuthSync(auth, notifications));

    expect(() => capturedCallback(session)).not.toThrow();
    // Let the fire-and-forget registerPushToken().catch() settle without an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = jest.fn();
    const auth = {
      onAuthStateChange: jest.fn().mockReturnValue(unsubscribe),
    } as unknown as AuthService;
    const notifications = { registerPushToken: jest.fn() } as unknown as NotificationService;

    const { unmount } = renderHook(() => useAuthSync(auth, notifications));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
