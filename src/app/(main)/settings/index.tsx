import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useServices } from '@services/useServices';
import { spacing } from '@shared/tokens/spacing';
import type { Entitlement } from '@services/entitlement/EntitlementService';

function SettingsRow({
  label,
  onPress,
  value,
  destructive,
}: {
  label: string;
  onPress: () => void;
  value?: string;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { storage, entitlement } = useServices();
  const [cacheSize, setCacheSize] = useState<number>(0);
  const [entitlementData, setEntitlementData] = useState<Entitlement | null>(null);

  useEffect(() => {
    storage
      .getCacheSize()
      .then(setCacheSize)
      .catch(() => {});
    entitlement
      .fetchEntitlement()
      .then(setEntitlementData)
      .catch(() => {});
  }, [storage, entitlement]);

  const handleClearCache = () => {
    Alert.alert('Clear Cache', 'Remove all locally cached media?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SectionHeader title="Account" />
      <View style={styles.section}>
        <SettingsRow
          label="Subscription"
          value={entitlementData?.subscriptionTier === 'premium' ? 'Premium' : 'Free'}
          onPress={() => {
            void entitlement.manageSubscription();
          }}
        />
        <SettingsRow label="Manage Subscription" onPress={() => router.push('/(main)/paywall')} />
      </View>

      <SectionHeader title="Personalization" />
      <View style={styles.section}>
        <SettingsRow
          label="Interpretation Style"
          onPress={() => router.push('/(main)/settings/style')}
        />
        <SettingsRow
          label="Notifications"
          onPress={() => router.push('/(main)/settings/notifications')}
        />
      </View>

      <SectionHeader title="Privacy" />
      <View style={styles.section}>
        <SettingsRow label="AI Consent" onPress={() => router.push('/(main)/settings/privacy')} />
        <SettingsRow
          label="Export My Data"
          onPress={() => router.push('/(main)/settings/export')}
        />
        <SettingsRow
          label="Delete Account"
          onPress={() => router.push('/(main)/settings/delete-account')}
          destructive
        />
      </View>

      <SectionHeader title="App" />
      <View style={styles.section}>
        <SettingsRow label="About Morpheo" onPress={() => {}} value="v1.0.0" />
        <SettingsRow
          label="Clear Cache"
          value={`${formatBytes(cacheSize)} used`}
          onPress={handleClearCache}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content: { paddingBottom: spacing.xxl },
  sectionHeader: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  section: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: spacing.md,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a3e',
  },
  rowLabel: { flex: 1, fontSize: 15, color: '#ddd' },
  rowLabelDestructive: { color: '#e05c5c' },
  rowValue: { fontSize: 14, color: '#666', marginRight: spacing.xs },
  chevron: { color: '#444', fontSize: 18 },
});
