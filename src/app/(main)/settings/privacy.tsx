import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../supabase/client';
import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface ConsentState {
  granted: boolean;
  updatedAt: string | null;
}

export default function PrivacyScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void loadConsent();
  }, []);

  const loadConsent = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('ai_consent_granted, ai_consent_granted_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Failed to load consent state:', error);
      setLoadError(t('settingsPrivacy.loadError'));
      return;
    }
    const row = data as {
      ai_consent_granted: boolean | null;
      ai_consent_granted_at: string | null;
    } | null;
    setLoadError(null);
    setConsent({
      granted: row?.ai_consent_granted ?? false,
      updatedAt: row?.ai_consent_granted_at ?? null,
    });
  };

  const updateConsent = async (granted: boolean) => {
    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const now = new Date().toISOString();
      // ai_consent_granted_at records when consent was granted, so it is cleared on
      // withdrawal; consent_records is the append-only audit trail of both directions.
      const grantedAt = granted ? now : null;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          ai_consent_granted: granted,
          ai_consent_granted_at: grantedAt,
        })
        .eq('id', user.id);
      if (profileError) {
        console.error('Failed to update consent:', profileError);
        Alert.alert(t('settingsPrivacy.saveErrorTitle'), t('settingsPrivacy.saveErrorBody'));
        return;
      }
      const { error: auditError } = await supabase.from('consent_records').insert({
        user_id: user.id,
        action: granted ? 'granted' : 'revoked',
        recorded_at: now,
      });
      if (auditError) {
        // The preference itself is saved; only the audit row failed. Surface it rather
        // than dropping it, since consent history is a compliance record.
        console.error('Failed to write consent audit record:', auditError);
      }
      setConsent({ granted, updatedAt: grantedAt });
    } finally {
      setIsSaving(false);
    }
  };

  const dateLabel = consent?.updatedAt
    ? new Date(consent.updatedAt).toLocaleDateString(i18n.language)
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.title}>{t('settingsPrivacy.title')}</Text>
      <Text style={styles.description}>{t('settingsPrivacy.description')}</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>{t('settingsPrivacy.statusLabel')}</Text>
        <Text
          style={[
            styles.statusValue,
            consent?.granted ? styles.statusGranted : styles.statusWithdrawn,
          ]}
        >
          {consent?.granted
            ? t('settingsPrivacy.statusGranted')
            : t('settingsPrivacy.statusWithdrawn')}
        </Text>
        {dateLabel && (
          <Text style={styles.statusDate}>
            {t('settingsPrivacy.statusDate', { date: dateLabel })}
          </Text>
        )}
      </View>

      {loadError && <Text style={styles.loadError}>{loadError}</Text>}

      {isSaving ? (
        <ActivityIndicator color={colors.accent} />
      ) : consent?.granted ? (
        <Button
          label={t('settingsPrivacy.withdraw')}
          variant="secondary"
          onPress={() => {
            void updateConsent(false);
          }}
          style={styles.withdrawButton}
        />
      ) : (
        <Button
          label={t('settingsPrivacy.grant')}
          onPress={() => {
            void updateConsent(true);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { ...typography.screenTitle, fontSize: 22 },
  description: { ...typography.meta, fontSize: 13, lineHeight: 20 },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statusLabel: {
    ...typography.overline,
  },
  statusValue: { ...typography.cardTitle, fontSize: 16 },
  statusGranted: { color: colors.success },
  statusWithdrawn: { color: colors.error },
  statusDate: { ...typography.meta },
  loadError: { ...typography.meta, color: colors.error, marginBottom: spacing.md },
  withdrawButton: {
    borderColor: colors.error,
  },
});
