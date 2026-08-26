import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncPendingDreams, AuthExpiredError } from './syncService';
import { pullRemoteChanges } from '@features/sync/pullService';
import type { MediaCacheDeps } from '@features/sync/mediaCache';
import type { AuthService } from '@services/auth/AuthService';

export function useSyncOnConnect(auth: AuthService, mediaCache: MediaCacheDeps) {
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
          // Push this device's own pending changes first, so they reach the server
          // before the pull reconciles down — otherwise an in-flight local edit
          // could look like something the pull should discard.
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

        try {
          const session = await auth.getSession();
          if (session) await pullRemoteChanges(session.user.id, mediaCache);
        } catch (err) {
          console.error('Pull sync on reconnect failed:', err);
        }
      }
    };

    const unsubscribe = NetInfo.addEventListener(state => {
      void handleConnectivityChange(state);
    });

    return () => unsubscribe();
  }, [auth]);
}
