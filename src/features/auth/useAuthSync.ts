import { useEffect } from 'react';
import { pullRemoteChanges } from '@features/sync/pullService';
import type { MediaCacheDeps } from '@features/sync/mediaCache';
import type { AuthService } from '@services/auth/AuthService';
import type { NotificationService } from '@services/notifications/NotificationService';

export function useAuthSync(
  auth: AuthService,
  notifications: NotificationService,
  mediaCache: MediaCacheDeps
) {
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChange(session => {
      if (session) {
        // Push token registration is non-critical; failure does not block auth
        void notifications.registerPushToken().catch((err: unknown) => {
          console.error('Push token registration failed:', err);
        });

        // A fresh login (or fresh install) has an empty/stale local SQLite — backfill
        // from Supabase immediately so the journal isn't shown empty until the next
        // foreground/reconnect sync cycle.
        void pullRemoteChanges(session.user.id, mediaCache).catch((err: unknown) => {
          console.error('Pull sync on login failed:', err);
        });
      }
    });
    return unsubscribe;
  }, [auth, notifications, mediaCache]);
}
