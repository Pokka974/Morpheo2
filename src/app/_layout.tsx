import React, { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@services/../supabase/client';
import { SupabaseAuthService } from '@services/auth/SupabaseAuthService';
import { ExpoLocalLockService } from '@services/auth/ExpoLocalLockService';
import { ClaudeInterpretationService } from '@services/ai/interpretation/ClaudeInterpretationService';
import { DallEImageGenerationService } from '@services/ai/image/DallEImageGenerationService';
import { LumaVideoGenerationService } from '@services/ai/video/LumaVideoGenerationService';
import { ExpoStorageService } from '@services/storage/ExpoStorageService';
import { RevenueCatEntitlementService } from '@services/subscription/RevenueCatEntitlementService';
import { ExpoNotificationService } from '@services/notifications/ExpoNotificationService';
import { ServicesProvider } from '@services/ServicesProvider';
import type { ServiceRegistry } from '@services/registry';

const lockService = new ExpoLocalLockService();
const storageService = new ExpoStorageService();

const services: ServiceRegistry = {
  auth: new SupabaseAuthService(),
  localLock: lockService,
  interpretation: new ClaudeInterpretationService(),
  imageGeneration: new DallEImageGenerationService(storageService),
  videoGeneration: new LumaVideoGenerationService(),
  storage: storageService,
  entitlement: new RevenueCatEntitlementService(),
  notifications: new ExpoNotificationService(),
};

type AuthState = 'loading' | 'onboarding' | 'unauthenticated' | 'locked' | 'ready';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

function AppNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    const rcKey = process.env['EXPO_PUBLIC_REVENUECAT_API_KEY'];
    if (rcKey) RevenueCatEntitlementService.configure(rcKey);
    initApp();
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

    const { data: { session } } = await supabase.auth.getSession();
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
      services.storage.evictToLimit(MAX_CACHE_BYTES).catch(() => {});
    }
  }

  return (
    <ServicesProvider services={services}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { paddingTop: insets.top },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
    </ServicesProvider>
  );
}
