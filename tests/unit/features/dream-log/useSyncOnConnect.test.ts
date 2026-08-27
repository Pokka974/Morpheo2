const mockAddEventListener = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (...args: unknown[]) => mockAddEventListener(...args) },
}));

const mockSyncPendingDreams = jest.fn();

jest.mock('@features/dream-log/syncService', () => {
  class AuthExpiredError extends Error {
    constructor() {
      super('Auth session expired during sync');
      this.name = 'AuthExpiredError';
    }
  }
  return {
    AuthExpiredError,
    syncPendingDreams: (...args: unknown[]) => mockSyncPendingDreams(...args),
  };
});

const mockPullRemoteChanges = jest.fn();
jest.mock('@features/sync/pullService', () => ({
  pullRemoteChanges: (...args: unknown[]) => mockPullRemoteChanges(...args),
}));

import { renderHook } from '@testing-library/react-native';
import { useSyncOnConnect } from '@features/dream-log/useSyncOnConnect';

/** The hook only forwards this to `pullRemoteChanges`, which is mocked here, so a
 * set of no-op stubs is enough to satisfy the dependency. */
const mediaCache = {
  getSignedUrl: jest.fn(async () => 'https://example.com/signed.png'),
  cacheMedia: jest.fn(async () => '/local/path.png'),
  removeCachedMedia: jest.fn(async () => {}),
};

import { AuthExpiredError } from '@features/dream-log/syncService';
import type { AuthService } from '@services/auth/AuthService';

function getNetInfoHandler(): (state: {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}) => void {
  const calls = mockAddEventListener.mock.calls;
  return calls[calls.length - 1]![0];
}

// The production listener wraps the async handler in a fire-and-forget `void` call
// (required so it type-checks against NetInfo's void-returning listener signature),
// so calling it no longer yields a promise we can await — flush pending microtasks instead.
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('useSyncOnConnect', () => {
  let auth: AuthService;
  let unsubscribe: jest.Mock;

  beforeEach(() => {
    mockAddEventListener.mockReset();
    mockSyncPendingDreams.mockReset();
    mockPullRemoteChanges.mockReset();
    unsubscribe = jest.fn();
    mockAddEventListener.mockReturnValue(unsubscribe);
    auth = { getSession: jest.fn() } as unknown as AuthService;
  });

  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useSyncOnConnect(auth, mediaCache));
    expect(mockAddEventListener).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not sync when going offline (marks wasOffline for later)', async () => {
    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    expect(mockSyncPendingDreams).not.toHaveBeenCalled();
  });

  it('does not sync on a connected event if it was never offline first', async () => {
    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: true, isInternetReachable: true });
    await flush();
    expect(mockSyncPendingDreams).not.toHaveBeenCalled();
  });

  it('syncs pending dreams once reconnected after being offline', async () => {
    mockSyncPendingDreams.mockResolvedValue(undefined);
    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    handler({ isConnected: true, isInternetReachable: true });
    await flush();

    expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1);
  });

  it('treats isInternetReachable === false as offline even when isConnected is true', async () => {
    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: true, isInternetReachable: false });
    await flush();
    expect(mockSyncPendingDreams).not.toHaveBeenCalled();

    handler({ isConnected: true, isInternetReachable: true });
    await flush();
    expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1);
  });

  it('on AuthExpiredError, refreshes the session and retries the sync', async () => {
    mockSyncPendingDreams
      .mockRejectedValueOnce(new AuthExpiredError())
      .mockResolvedValueOnce(undefined);
    (auth.getSession as jest.Mock).mockResolvedValue(null);

    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    handler({ isConnected: true, isInternetReachable: true });
    await flush();

    // Once to refresh the session inside the AuthExpiredError retry, once more
    // afterward to look up the userId for the pull step.
    expect(auth.getSession).toHaveBeenCalledTimes(2);
    expect(mockSyncPendingDreams).toHaveBeenCalledTimes(2);
    // getSession resolved null both times, so there's no userId to pull with.
    expect(mockPullRemoteChanges).not.toHaveBeenCalled();
  });

  it('silently gives up when the session refresh itself fails after an AuthExpiredError', async () => {
    mockSyncPendingDreams.mockRejectedValueOnce(new AuthExpiredError());
    (auth.getSession as jest.Mock).mockRejectedValue(new Error('refresh failed'));

    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    expect(() => handler({ isConnected: true, isInternetReachable: true })).not.toThrow();
    await flush();

    expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1);
  });

  it('swallows a non-auth sync error without retrying the push via getSession', async () => {
    mockSyncPendingDreams.mockRejectedValueOnce(new Error('generic failure'));

    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    expect(() => handler({ isConnected: true, isInternetReachable: true })).not.toThrow();
    await flush();

    // Still called exactly once — for the pull step's userId lookup — even though
    // the push failed with a non-auth error and skipped its own retry path.
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('pulls remote changes for the current user once reconnected', async () => {
    mockSyncPendingDreams.mockResolvedValue(undefined);
    (auth.getSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-42' },
      accessToken: 't',
      expiresAt: 0,
    });
    mockPullRemoteChanges.mockResolvedValue(undefined);

    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    handler({ isConnected: true, isInternetReachable: true });
    await flush();

    expect(mockPullRemoteChanges).toHaveBeenCalledWith(
      'user-42',
      expect.objectContaining({
        getSignedUrl: expect.any(Function),
        cacheMedia: expect.any(Function),
        removeCachedMedia: expect.any(Function),
      })
    );
  });

  it('does not pull when there is no active session after reconnecting', async () => {
    mockSyncPendingDreams.mockResolvedValue(undefined);

    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    handler({ isConnected: true, isInternetReachable: true });
    await flush();

    expect(mockPullRemoteChanges).not.toHaveBeenCalled();
  });

  it('logs and swallows a pull failure without throwing', async () => {
    mockSyncPendingDreams.mockResolvedValue(undefined);
    (auth.getSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-1' },
      accessToken: 't',
      expiresAt: 0,
    });
    mockPullRemoteChanges.mockRejectedValue(new Error('pull failed'));

    renderHook(() => useSyncOnConnect(auth, mediaCache));
    const handler = getNetInfoHandler();

    handler({ isConnected: false, isInternetReachable: null });
    await flush();
    expect(() => handler({ isConnected: true, isInternetReachable: true })).not.toThrow();
    await flush();

    expect(mockPullRemoteChanges).toHaveBeenCalled();
  });
});
