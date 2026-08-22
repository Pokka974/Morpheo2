import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useIdleTimeout } from '@features/auth/useIdleTimeout';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function getAppStateHandler(): (state: string) => void {
  const addEventListenerMock = AppState.addEventListener as jest.Mock;
  const changeCalls = addEventListenerMock.mock.calls.filter(c => c[0] === 'change');
  // Use the most recent registration — each test mounts its own hook instance.
  return changeCalls[changeCalls.length - 1]![1];
}

describe('useIdleTimeout', () => {
  let onLockRequired: jest.Mock;
  let localLock: MockLocalLockService;

  beforeEach(() => {
    onLockRequired = jest.fn();
    localLock = new MockLocalLockService();
    jest.spyOn(AppState, 'addEventListener');
    (AsyncStorage.getItem as jest.Mock).mockReset();
  });

  it('subscribes to AppState changes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useIdleTimeout(localLock, onLockRequired));
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
  });

  it('does not call onLockRequired when going background then active before the timeout elapses', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('5');
    renderHook(() => useIdleTimeout(localLock, onLockRequired));
    const handler = getAppStateHandler();

    await act(async () => {
      await handler('background');
      await handler('active');
    });

    expect(onLockRequired).not.toHaveBeenCalled();
  });

  it('calls onLockRequired when the stored timeout has elapsed (0-minute timeout)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('0');
    renderHook(() => useIdleTimeout(localLock, onLockRequired));
    const handler = getAppStateHandler();

    await act(async () => {
      await handler('inactive');
      await handler('active');
    });

    expect(onLockRequired).toHaveBeenCalledTimes(1);
  });

  it('falls back to the 5-minute default when no value is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    renderHook(() => useIdleTimeout(localLock, onLockRequired));
    const handler = getAppStateHandler();

    await act(async () => {
      await handler('background');
      await handler('active');
    });

    expect(onLockRequired).not.toHaveBeenCalled();
  });

  it('falls back to the default when the stored value is not a number', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not-a-number');
    renderHook(() => useIdleTimeout(localLock, onLockRequired));
    const handler = getAppStateHandler();

    await act(async () => {
      await handler('background');
      await handler('active');
    });

    expect(onLockRequired).not.toHaveBeenCalled();
  });

  it('falls back to the default when AsyncStorage.getItem throws', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage error'));
    renderHook(() => useIdleTimeout(localLock, onLockRequired));
    const handler = getAppStateHandler();

    await act(async () => {
      await handler('background');
      await handler('active');
    });

    expect(onLockRequired).not.toHaveBeenCalled();
  });

  it('ignores state transitions that are neither background/inactive nor active', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('5');
    renderHook(() => useIdleTimeout(localLock, onLockRequired));
    const handler = getAppStateHandler();

    await act(async () => {
      await handler('unknown');
    });

    expect(onLockRequired).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });
});
