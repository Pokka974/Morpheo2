import { useEffect } from 'react';
import type { AuthService } from '@services/auth/AuthService';
import type { NotificationService } from '@services/notifications/NotificationService';

export function useAuthSync(auth: AuthService, notifications: NotificationService) {
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChange(async session => {
      if (session) {
        try {
          await notifications.registerPushToken();
        } catch {
          // Push token registration is non-critical; failure does not block auth
        }
      }
    });
    return unsubscribe;
  }, [auth, notifications]);
}
