import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncPendingDreams, AuthExpiredError } from './syncService';
import type { AuthService } from '@services/auth/AuthService';

export function useSyncOnConnect(auth: AuthService) {
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    const handleConnectivityChange = async (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => {
      const isConnected = state.isConnected && state.isInternetReachable !== false;

      if (!isConnected) {
        wasOfflineRef.current = true;
        return;
      }

      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        try {
          await syncPendingDreams();
        } catch (err) {
          if (err instanceof AuthExpiredError) {
            try {
              await auth.getSession();
              await syncPendingDreams();
            } catch {
              // Session refresh failed: surface via notification
            }
          }
        }
      }
    };

    const unsubscribe = NetInfo.addEventListener(state => {
      void handleConnectivityChange(state);
    });

    return () => unsubscribe();
  }, [auth]);
}
