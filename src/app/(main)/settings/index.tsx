import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useServices } from '@services/useServices';
import type { Entitlement } from '@services/entitlement/EntitlementService';
import { SettingsRow, SettingsSection } from '@shared/components/SettingsRow';
import { seedSampleDreams } from '@features/dev/seedSampleDreams';
import { colors, spacing, typography } from '@theme/tokens';

const APP_VERSION = 'v1.0.0';

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { storage, entitlement, auth } = useServices();
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [entitlementData, setEntitlementData] = useState<Entitlement | null>(null);

  useEffect(() => {
    storage
      .getCacheSize()
      .then(setCacheSize)
      .catch((err: unknown) => {
        console.error('Failed to read cache size:', err);
      });
    entitlement
      .fetchEntitlement()
      .then(setEntitlementData)
      .catch((err: unknown) => {
        console.error('Failed to load entitlement:', err);
      });
  }, [storage, entitlement]);

  const handleClearCache = () => {
    Alert.alert(t('settings.clearCacheAlertTitle'), t('settings.clearCacheAlertBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.clear'),
        onPress: () => {
          void (async () => {
            await storage.clearCache();
            const newSize = await storage.getCacheSize();
            setCacheSize(newSize);
          })();
        },
      },
    ]);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const tierLabel =
    entitlementData?.subscriptionTier === 'premium'
      ? t('settings.tierPremium')
      : t('settings.tierFree');

  const handleSeedDreams = () => {
    void (async () => {
      const session = await auth.getSession();
      if (!session) return;
      try {
        const { count } = await seedSampleDreams(session.user.id);
        Alert.alert(
          t('settings.seedDreamsSuccessTitle'),
          t('settings.seedDreamsSuccessBody', { count })
        );
      } catch (err) {
        console.error('Failed to seed sample dreams:', err);
        Alert.alert(t('settings.seedDreamsErrorTitle'));
      }
    })();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
    >
      <Text style={styles.title}>{t('settings.title')}</Text>

      <SettingsSection title={t('settings.sectionAccount')}>
        <SettingsRow
          label={t('settings.subscriptionRow')}
          value={tierLabel}
          onPress={() => {
            void entitlement.manageSubscription();
          }}
        />
        <SettingsRow
          label={t('settings.manageSubscriptionRow')}
          onPress={() => router.push('/(main)/paywall')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sectionPersonalization')}>
        <SettingsRow
          label={t('settings.interpretationStyleRow')}
          onPress={() => router.push('/(main)/settings/style')}
        />
        <SettingsRow
          label={t('settings.notificationsRow')}
          onPress={() => router.push('/(main)/settings/notifications')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sectionPrivacy')}>
        <SettingsRow
          label={t('settings.aiConsentRow')}
          onPress={() => router.push('/(main)/settings/privacy')}
        />
        <SettingsRow
          label={t('settings.exportDataRow')}
          onPress={() => router.push('/(main)/settings/export')}
        />
        <SettingsRow
          label={t('settings.deleteAccountRow')}
          onPress={() => router.push('/(main)/settings/delete-account')}
          destructive
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sectionApp')}>
        <SettingsRow label={t('settings.aboutRow')} value={APP_VERSION} navigable={false} />
        <SettingsRow
          label={t('settings.clearCacheRow')}
          value={t('settings.cacheUsed', { size: formatBytes(cacheSize) })}
          onPress={handleClearCache}
          navigable={false}
        />
      </SettingsSection>

      {__DEV__ ? (
        <SettingsSection title={t('settings.sectionDeveloper')}>
          <SettingsRow
            label={t('settings.seedDreamsRow')}
            onPress={handleSeedDreams}
            navigable={false}
          />
        </SettingsSection>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.screenTitle,
    paddingHorizontal: spacing.md,
  },
});
