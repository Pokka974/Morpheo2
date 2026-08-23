import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
}));

// seedSampleDreams transitively imports syncPendingDreams -> the real Supabase client,
// which throws at import time without EXPO_PUBLIC_SUPABASE_URL/ANON_KEY. This suite
// doesn't exercise dev-seeding, so keep it out of the module graph entirely.
const mockSeedSampleDreams = jest.fn().mockResolvedValue({ count: 6 });
jest.mock('@features/dev/seedSampleDreams', () => ({
  seedSampleDreams: (...args: unknown[]) => mockSeedSampleDreams(...args),
}));

let alertSpy: jest.SpyInstance;

function buildRegistry(overrides: Partial<ServiceRegistry> = {}): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications: new MockNotificationService(),
    ...overrides,
  };
}

import SettingsScreen from '@app/(main)/settings/index';

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows Free subscription label and KB-formatted cache size for a small cache', async () => {
    const storage = new MockStorageService();
    // MockStorageService reports cache.size * 1MB, so with an empty cache it starts at 0 bytes (0.0 KB).
    const registry = buildRegistry({ storage, entitlement: new MockEntitlementService().configure('free') });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Free')).toBeTruthy());
    expect(getByText('0.0 KB used')).toBeTruthy();
  });

  it('shows Premium subscription label when entitlement is premium', async () => {
    const registry = buildRegistry({ entitlement: new MockEntitlementService().configure('premium') });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Premium')).toBeTruthy());
  });

  it('formats cache size in MB once a cached item pushes it past 1MB', async () => {
    const storage = new MockStorageService();
    await storage.cacheMedia('media-1', 'https://example.com/1');
    const registry = buildRegistry({ storage });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('1.0 MB used')).toBeTruthy());
  });

  it('pressing "Manage Subscription" navigates to the paywall', async () => {
    const registry = buildRegistry();
    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Free')).toBeTruthy());

    fireEvent.press(getByText('Manage subscription'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/paywall');
  });

  it('pressing "Sign out" shows a confirm alert, and confirming signs out and navigates to sign-in', async () => {
    const auth = new MockAuthService();
    const signOutSpy = jest.spyOn(auth, 'signOut');
    const registry = buildRegistry({ auth });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Free')).toBeTruthy());

    fireEvent.press(getByText('Sign out'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Sign out?',
      'You can sign back in at any time. Any unsynced dreams stay on this device.',
      expect.any(Array)
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const signOutButton = buttons.find(b => b.text === 'Sign out')!;
    await act(async () => {
      await signOutButton.onPress?.();
    });

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('pressing the "Subscription" row calls entitlement.manageSubscription', async () => {
    const entitlement = new MockEntitlementService();
    const manageSpy = jest.spyOn(entitlement, 'manageSubscription');
    const registry = buildRegistry({ entitlement });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Free')).toBeTruthy());

    fireEvent.press(getByText('Subscription'));
    expect(manageSpy).toHaveBeenCalledTimes(1);
  });

  it('navigates to the correct route for each personalization/privacy row', async () => {
    const registry = buildRegistry();
    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Free')).toBeTruthy());

    fireEvent.press(getByText('Interpretation style'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/settings/style');

    fireEvent.press(getByText('Notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/settings/notifications');

    fireEvent.press(getByText('AI consent'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/settings/privacy');

    fireEvent.press(getByText('Export my data'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/settings/export');

    fireEvent.press(getByText('Delete account'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/settings/delete-account');
  });

  it('"About Morpheo" row shows a version value and is a no-op on press', async () => {
    const registry = buildRegistry();
    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Free')).toBeTruthy());

    expect(getByText('v1.0.0')).toBeTruthy();
    fireEvent.press(getByText('About Morpheo'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('pressing "Clear Cache" shows a confirm alert, and confirming clears + refreshes the size', async () => {
    const storage = new MockStorageService();
    await storage.cacheMedia('media-1', 'https://example.com/1');
    const clearSpy = jest.spyOn(storage, 'clearCache');
    const registry = buildRegistry({ storage });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('1.0 MB used')).toBeTruthy());

    fireEvent.press(getByText('1.0 MB used'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Clear cache',
      'Remove all locally cached media?',
      expect.any(Array)
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const clearButton = buttons.find(b => b.text === 'Clear')!;
    await act(async () => {
      await clearButton.onPress?.();
    });

    expect(clearSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByText('0.0 KB used')).toBeTruthy());
  });

  it('does not crash when storage.getCacheSize() rejects (covers the catch branch)', async () => {
    const storage = new MockStorageService();
    jest.spyOn(storage, 'getCacheSize').mockRejectedValueOnce(new Error('disk error'));
    const registry = buildRegistry({ storage });

    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('Free')).toBeTruthy());
    expect(getByText('0.0 KB used')).toBeTruthy();
  });

  it('shows a Developer section (this test build always runs with __DEV__ true) and seeds sample dreams on press', async () => {
    const registry = buildRegistry();
    const { getByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Free')).toBeTruthy());

    fireEvent.press(getByText('Seed sample dreams'));

    await waitFor(() => expect(mockSeedSampleDreams).toHaveBeenCalledWith('mock-user-id'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Sample dreams added',
      '6 dreams added. Open Insights to see the constellation and emotion ribbon.'
    );
  });

  it('does not crash when entitlement.fetchEntitlement() rejects (covers the catch branch)', async () => {
    const entitlement = new MockEntitlementService();
    jest.spyOn(entitlement, 'fetchEntitlement').mockRejectedValueOnce(new Error('network error'));
    const registry = buildRegistry({ entitlement });

    const { getByText, queryByText } = render(
      <ServicesProvider services={registry}>
        <SettingsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByText('0.0 KB used')).toBeTruthy());
    // entitlementData stays null, so the Subscription row renders the "Free" fallback value.
    expect(queryByText('Free')).toBeTruthy();
  });
});
