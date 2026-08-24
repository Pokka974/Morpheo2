import React, { useEffect, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@services/../supabase/client';
import { SupabaseAuthService } from '@services/auth/SupabaseAuthService';
import { ExpoLocalLockService } from '@services/auth/ExpoLocalLockService';
import { ClaudeInterpretationService } from '@services/ai/interpretation/ClaudeInterpretationService';
import { OpenAIImageGenerationService } from '@services/ai/image/OpenAIImageGenerationService';
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

// Resolve the device language before the first render so no screen flashes English
// on its way to French.
initI18n();

const lockService = new ExpoLocalLockService();
const storageService = new ExpoStorageService();

const services: ServiceRegistry = {
  auth: new SupabaseAuthService(),
  localLock: lockService,
  interpretation: new ClaudeInterpretationService(),
  imageGeneration: new OpenAIImageGenerationService(storageService),
  videoGeneration: new LumaVideoGenerationService(),
  storage: storageService,
  entitlement: new RevenueCatEntitlementService(),
  notifications: new ExpoNotificationService(),
};

type AuthState = 'loading' | 'onboarding' | 'unauthenticated' | 'locked' | 'ready';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();

  // The type scale is metric-tuned to Manrope, so rendering before the faces resolve
  // shows a system-font flash at the wrong sizes. A font failure must not block the
  // app, though — fall through to system faces rather than trapping the user.
  if (!fontsLoaded && !fontError) {
    return <View style={styles.splash} />;
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

function AppNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [authState, setAuthState] = useState<AuthState>('loading');

  useSyncOnConnect(services.auth);
  useAuthSync(services.auth, services.notifications);

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
  }, [authState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  async function initApp() {
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
      await syncPendingDreams();
    } catch (err) {
      console.error('Push sync on foreground failed:', err);
    }
    try {
      await pullRemoteChanges(session.user.id);
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
