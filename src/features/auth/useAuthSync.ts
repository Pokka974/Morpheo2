import { useEffect } from 'react';
import { pullRemoteChanges } from '@features/sync/pullService';
import type { MediaCacheDeps } from '@features/sync/mediaCache';
import type { AuthService } from '@services/auth/AuthService';
import type { NotificationService } from '@services/notifications/NotificationService';
import type { EntitlementService } from '@services/entitlement/EntitlementService';

export function useAuthSync(
  auth: AuthService,
  notifications: NotificationService,
  entitlement: EntitlementService,
  mediaCache: MediaCacheDeps
) {
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChange(session => {
      if (session) {
        // Bind the purchase provider to this user before anything can buy anything. It
        // fires on a restored session as well as a fresh sign-in, which is what we want:
        // RevenueCat keeps its own identity across launches, so a session we never told
        // it about would still transact anonymously. Failure is logged inside the
        // adapter and must not block the rest of the sign-in path.
        void entitlement.identify(session.user.id);

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
      } else {
        // Sign-out. Release the binding, or the next account to sign in on this device
        // inherits the previous one's purchases until RevenueCat is told otherwise.
        void entitlement.resetIdentity();
      }
    });
    return unsubscribe;
  }, [auth, notifications, entitlement, mediaCache]);
}
