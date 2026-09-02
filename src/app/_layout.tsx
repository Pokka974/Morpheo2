import React, { useEffect, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@services/../supabase/client';
import { SupabaseAuthService } from '@services/auth/SupabaseAuthService';
import { ExpoLocalLockService } from '@services/auth/ExpoLocalLockService';
import { ClaudeInterpretationService } from '@services/ai/interpretation/ClaudeInterpretationService';
import { FluxImageGenerationService } from '@services/ai/image/FluxImageGenerationService';
import { LumaVideoGenerationService } from '@services/ai/video/LumaVideoGenerationService';
import { ExpoStorageService } from '@services/storage/ExpoStorageService';
import { RevenueCatEntitlementService } from '@services/subscription/RevenueCatEntitlementService';
import { ExpoNotificationService } from '@services/notifications/ExpoNotificationService';
import { ServicesProvider } from '@services/ServicesProvider';
import type { ServiceRegistry } from '@services/registry';
import { initI18n } from '@i18n/index';
import { useAppFonts } from '@theme/useAppFonts';
import { colors } from '@theme/tokens';
import { useSyncOnConnect } from '@features/dream-log/useSyncOnConnect';
import { syncPendingDreams } from '@features/dream-log/syncService';
import { useAuthSync } from '@features/auth/useAuthSync';
import { pullRemoteChanges } from '@features/sync/pullService';
import { makeMediaCache } from '@features/sync/mediaCache';
import { BrandSplash, SPLASH_FADE_MS } from '@shared/components/BrandSplash';

// Resolve the device language before the first render so no screen flashes English
// on its way to French.
initI18n();

// The native splash stays up until `BrandSplash` has painted its replacement — the
// fonts, the session and the first route all resolve behind it, and without this it
// would tear down the moment this module's first view mounts, exposing an empty
// background. `BrandSplash` owns the corresponding `hideAsync()`.
SplashScreen.preventAutoHideAsync().catch((err: unknown) => {
  // Losing the hold is a cosmetic failure, never a reason not to boot.
  console.error('Holding the native splash screen failed:', err);
});

// iOS only; on Android the platform runs its own icon animation out.
SplashScreen.setOptions({ duration: SPLASH_FADE_MS, fade: true });

const lockService = new ExpoLocalLockService();
const storageService = new ExpoStorageService();

const services: ServiceRegistry = {
  auth: new SupabaseAuthService(),
  localLock: lockService,
  interpretation: new ClaudeInterpretationService(),
  imageGeneration: new FluxImageGenerationService(storageService),
  videoGeneration: new LumaVideoGenerationService(),
  storage: storageService,
  entitlement: new RevenueCatEntitlementService(),
  notifications: new ExpoNotificationService(),
};

// Built once alongside `services` so its identity is stable: both hooks below take
// it as a dependency, and a fresh object per render would re-subscribe every time.
const mediaCache = makeMediaCache(services);

type AuthState = 'loading' | 'onboarding' | 'unauthenticated' | 'locked' | 'ready';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  // The launch screen leaves on two conditions, tracked separately: the app knows
  // where it is going, and the screen itself has finished fading out.
  const [contentReady, setContentReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // The type scale is metric-tuned to Manrope, so rendering before the faces resolve
  // shows a system-font flash at the wrong sizes. A font failure must not block the
  // app, though — fall through to system faces rather than trapping the user. The
  // native splash is still up over this view; nobody sees it.
  if (!fontsLoaded && !fontError) {
    return <View style={styles.splash} />;
  }

  return (
    // Gesture handler must wrap the whole tree, above navigation — the Insights
    // constellation is pinch-zoomable and its detector is inert outside this root.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppNavigator onContentReady={() => setContentReady(true)} />
      </SafeAreaProvider>
      {/* Last child, so it covers the navigator while it is up. */}
      {splashDone ? null : (
        <BrandSplash ready={contentReady} onFinish={() => setSplashDone(true)} />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

interface NavigatorProps {
  /** Fired once the first route is resolved — the cue for the launch screen to leave. */
  onContentReady: () => void;
}

function AppNavigator({ onContentReady }: NavigatorProps) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [authState, setAuthState] = useState<AuthState>('loading');

  useSyncOnConnect(services.auth, mediaCache);
  useAuthSync(services.auth, services.notifications, mediaCache);

  useEffect(() => {
    const rcKey = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'] as string | undefined;
    if (rcKey) RevenueCatEntitlementService.configure(rcKey);
    void initApp();
  }, []);

  // Navigate only after the Stack is mounted and authState is resolved
  useEffect(() => {
    if (authState === 'loading') return;
    if (authState === 'onboarding') router.replace('/(auth)/onboarding/welcome');
    else if (authState === 'unauthenticated') router.replace('/(auth)/sign-in');
    else if (authState === 'locked') router.replace('/(auth)/lock');
    else router.replace('/(main)/journal');
    // The launch screen covers this replace, so the first screen a user sees is the
    // one they belong on rather than a flash of the index route on its way there.
    onContentReady();
  }, [authState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  async function initApp() {
    try {
      const onboardingComplete = await AsyncStorage.getItem('onboarding_complete');
      if (!onboardingComplete) {
        setAuthState('onboarding');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setAuthState('unauthenticated');
      } else if (lockService.isLockRequired()) {
        setAuthState('locked');
      } else {
        setAuthState('ready');
      }
    } catch (err) {
      // Storage or the session lookup failed. Leaving `authState` on 'loading' would
      // strand the app under its own launch screen, which never leaves until a route
      // resolves — so fall back to sign-in, the one destination that is always safe.
      console.error('App start-up failed; falling back to sign-in:', err);
      setAuthState('unauthenticated');
    }
  }

  function handleAppStateChange(nextState: AppStateStatus) {
    if (nextState === 'active') {
      const inAuth = segments[0] === '(auth)';
      if (!inAuth && lockService.isLockRequired()) {
        router.push('/(auth)/lock');
      }
      const MAX_CACHE_BYTES = 200 * 1024 * 1024;
      services.storage.evictToLimit(MAX_CACHE_BYTES).catch((err: unknown) => {
        console.error('Cache eviction on foreground failed:', err);
      });

      void syncOnForeground();
    }
  }

  // Checked directly against the session rather than the `authState` value closed
  // over by this handler's subscription (`AppState.addEventListener` below fires
  // with whichever closure was live when it was registered), so this can't fire
  // with a stale "not ready yet" reading.
  async function syncOnForeground() {
    let session;
    try {
      session = await services.auth.getSession();
    } catch (err) {
      console.error('Session lookup for foreground sync failed:', err);
      return;
    }
    if (!session) return;

    try {
      await syncPendingDreams(mediaCache);
    } catch (err) {
      console.error('Push sync on foreground failed:', err);
    }
    try {
      await pullRemoteChanges(session.user.id, mediaCache);
    } catch (err) {
      console.error('Pull sync on foreground failed:', err);
    }
  }

  return (
    <ServicesProvider services={services}>
      <Stack
        screenOptions={{
          headerShown: false,
          // Paint every screen's reserved-but-unrendered area (the notch/status-bar
          // strip while a screen transitions in, the gap around a modal) in the app's
          // own background — the native default is white, which read as a jarring
          // flash/cut at the top of every screen.
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/*
         * (auth) screens don't yet manage their own top inset, so this group alone
         * gets it applied once, here. (main) screens each call useSafeAreaInsets()
         * themselves — giving it padding here too would double it, which is exactly
         * the "cuts the app at the top" bug this replaces.
         */}
        <Stack.Screen name="(auth)" options={{ contentStyle: { paddingTop: insets.top } }} />
        <Stack.Screen name="(main)" />
      </Stack>
    </ServicesProvider>
  );
}
