import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { useServices } from '@services/useServices';
import type { Entitlement } from '@services/entitlement/EntitlementService';
import { SettingsRow, SettingsSection } from '@shared/components/SettingsRow';
import { ProfileCard } from '@features/subscription/ProfileCard';
import { seedSampleDreams } from '@features/dev/seedSampleDreams';
import { pullRemoteChanges, resetSyncCursors } from '@features/sync/pullService';
import { makeMediaCache } from '@features/sync/mediaCache';
import { supabase } from '../../../supabase/client';
import { colors, spacing, typography } from '@theme/tokens';

const APP_VERSION = 'v1.0.0';

/** The row values the design shows, read in one query rather than one per row. */
interface Preferences {
  interpretationStyle: string | null;
  reminderTime: string | null;
  remindersEnabled: boolean;
  aiConsentGranted: boolean;
}

/**
 * Settings, restructured from an iOS-generic grouped list into a profile page.
 *
 * The change is in the ordering and the naming, not the vocabulary: the identity and
 * the remaining quota come first as a card (they were a value on a list row before,
 * which said nothing), and the four system-shaped groups — Account, Personalization,
 * Privacy, App — become three named from the user's side: what you read, your data,
 * your account. Every row still reports its current value, so the screen can be
 * scanned without opening anything.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const { storage, entitlement, auth } = services;
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [entitlementData, setEntitlementData] = useState<Entitlement | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [dreamCount, setDreamCount] = useState(0);
  const [since, setSince] = useState<Date | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  // Focus rather than mount: a purchase completes on the paywall screen, which then
  // calls router.back() here — without refetching on focus this card would keep
  // showing the free tier, correctly paid for, until the app restarts.
  useFocusEffect(
    useCallback(() => {
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
    }, [storage, entitlement])
  );

  useEffect(() => {
    void (async () => {
      const session = await auth.getSession();
      if (!session) return;
      setEmail(session.user.email);

      // "84 dreams · since February" comes from the local store, which is the one
      // that is always available — the card must render offline like the rest of
      // the app, so this is deliberately not a Supabase count.
      try {
        const row = await db.getFirstAsync<{ count: number; first: string | null }>(
          `SELECT COUNT(*) AS count, MIN(occurred_at) AS first
             FROM dreams WHERE user_id = ? AND is_deleted = 0`,
          [session.user.id]
        );
        setDreamCount(row?.count ?? 0);
        setSince(row?.first ? new Date(row.first) : null);
      } catch (err) {
        console.error('Failed to read the local dream count:', err);
      }
    })();
  }, [auth]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'interpretation_style, notification_reminder_time, notification_reminders_enabled, ai_consent_granted'
        )
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        // The rows still navigate without their values — a failed preference read
        // costs the screen its at-a-glance summary, not its function.
        console.error('Failed to load settings preferences:', error);
        return;
      }
      const row = data as {
        interpretation_style: string | null;
        notification_reminder_time: string | null;
        notification_reminders_enabled: boolean | null;
        ai_consent_granted: boolean | null;
      } | null;
      setPreferences({
        interpretationStyle: row?.interpretation_style ?? null,
        reminderTime: row?.notification_reminder_time ?? null,
        remindersEnabled: row?.notification_reminders_enabled ?? false,
        aiConsentGranted: row?.ai_consent_granted ?? false,
      });
    })();
  }, []);

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

  const handleSignOut = () => {
    Alert.alert(t('settings.signOutAlertTitle'), t('settings.signOutAlertBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.signOutRow'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await auth.signOut();
            router.replace('/(auth)/sign-in');
          })();
        },
      },
    ]);
  };

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

  /**
   * A dream a stale, superseded pull purged locally (the race `pullGeneration`
   * guards against — see pullService.ts) is gone for good from an ordinary
   * incremental pull: its cursor already sits past a `last_modified_at` it will
   * never see again. The dream was never touched server-side, so rewinding this
   * account's cursors to the epoch and pulling again recovers it exactly like a
   * fresh install would. Dev-only because the guard now prevents new instances of
   * that race — this is a repair tool for state a build predating the fix already
   * left behind, not something a real user's build should ever need.
   */
  const handleForceResync = () => {
    void (async () => {
      const session = await auth.getSession();
      if (!session) return;
      try {
        await resetSyncCursors(session.user.id);
        await pullRemoteChanges(session.user.id, makeMediaCache(services));
        Alert.alert(t('settings.forceResyncSuccessTitle'));
      } catch (err) {
        console.error('Failed to force a full re-sync:', err);
        Alert.alert(t('settings.forceResyncErrorTitle'));
      }
    })();
  };

  // The style row shows the short name of the choice, not the full radio label the
  // style screen uses ("Symbolic / Archetypal") — a row value has to fit on one line.
  const styleValue = preferences?.interpretationStyle
    ? t(`settings.style_${preferences.interpretationStyle}`, {
        defaultValue: preferences.interpretationStyle,
      })
    : undefined;

  const reminderValue = !preferences
    ? undefined
    : preferences.remindersEnabled && preferences.reminderTime
      ? // The column stores "HH:MM:SS"; the row shows the part a person reads.
        preferences.reminderTime.slice(0, 5)
      : t('settings.reminderOff');

  const consentValue = !preferences
    ? undefined
    : preferences.aiConsentGranted
      ? t('settings.consentGranted')
      : t('settings.consentWithheld');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
    >
      <Text style={styles.title}>{t('settings.title')}</Text>

      <ProfileCard
        email={email}
        dreamCount={dreamCount}
        since={since}
        entitlement={entitlementData}
        onUpgrade={() => router.push('/(main)/paywall')}
      />

      <SettingsSection title={t('settings.sectionReading')}>
        <SettingsRow
          label={t('settings.interpretationStyleRow')}
          value={styleValue}
          onPress={() => router.push('/(main)/settings/style')}
        />
        <SettingsRow
          label={t('settings.notificationsRow')}
          value={reminderValue}
          onPress={() => router.push('/(main)/settings/notifications')}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sectionData')}>
        <SettingsRow
          label={t('settings.aiConsentRow')}
          value={consentValue}
          onPress={() => router.push('/(main)/settings/privacy')}
        />
        <SettingsRow
          label={t('settings.exportDataRow')}
          onPress={() => router.push('/(main)/settings/export')}
        />
        <SettingsRow
          label={t('settings.clearCacheRow')}
          value={t('settings.cacheUsed', { size: formatBytes(cacheSize) })}
          onPress={handleClearCache}
          navigable={false}
        />
      </SettingsSection>

      <SettingsSection title={t('settings.sectionAccount')}>
        {/*
          No tier value here: the badge on the profile card already states it, and the
          design shows the tier exactly once. This row is the way out to the store.
        */}
        <SettingsRow
          label={t('settings.subscriptionRow')}
          onPress={() => {
            void entitlement.manageSubscription();
          }}
        />
        <SettingsRow
          label={t('settings.manageSubscriptionRow')}
          onPress={() => router.push('/(main)/paywall')}
        />
        <SettingsRow label={t('settings.aboutRow')} value={APP_VERSION} navigable={false} />
        <SettingsRow label={t('settings.signOutRow')} onPress={handleSignOut} navigable={false} />
        {/*
          The only red on this screen. The design puts sign-out and deletion in the same
          group — they are both "leaving" — but only deletion is irreversible, so only
          deletion carries the tone.
        */}
        <SettingsRow
          label={t('settings.deleteAccountRow')}
          onPress={() => router.push('/(main)/settings/delete-account')}
          destructive
        />
      </SettingsSection>

      {__DEV__ ? (
        <SettingsSection title={t('settings.sectionDeveloper')}>
          <SettingsRow
            label={t('settings.seedDreamsRow')}
            onPress={handleSeedDreams}
            navigable={false}
          />
          <SettingsRow
            label={t('settings.forceResyncRow')}
            onPress={handleForceResync}
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
