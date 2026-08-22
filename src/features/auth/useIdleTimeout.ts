import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalLockService } from '@services/auth/LocalLockService';

const IDLE_TIMEOUT_KEY = 'lock_idle_timeout_minutes';
const DEFAULT_TIMEOUT_MINUTES = 5;

export function useIdleTimeout(localLock: LocalLockService, onLockRequired: () => void) {
  const lastActiveRef = useRef<number>(Date.now());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      void handleAppStateChange(nextState);
    });
    return () => subscription.remove();
  }, [localLock]);

  async function getTimeoutMs(): Promise<number> {
    try {
      const raw = await AsyncStorage.getItem(IDLE_TIMEOUT_KEY);
      const minutes = raw ? parseInt(raw, 10) : DEFAULT_TIMEOUT_MINUTES;
      return (isNaN(minutes) ? DEFAULT_TIMEOUT_MINUTES : minutes) * 60 * 1000;
    } catch {
      return DEFAULT_TIMEOUT_MINUTES * 60 * 1000;
    }
  }

  async function handleAppStateChange(nextState: AppStateStatus) {
    if (nextState === 'background' || nextState === 'inactive') {
      lastActiveRef.current = Date.now();
    }

    if (nextState === 'active') {
      const timeoutMs = await getTimeoutMs();
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= timeoutMs) {
        onLockRequired();
      }
    }
  }
}
