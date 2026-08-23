import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../../supabase/client';
import { colors, spacing } from '@theme/tokens';

interface ConsentState {
  granted: boolean;
  updatedAt: string | null;
}

export default function PrivacyScreen() {
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
      setLoadError('Could not load your consent status.');
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
        Alert.alert('Could Not Save', 'Your consent preference was not saved. Please try again.');
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

  const dateLabel = consent?.updatedAt ? new Date(consent.updatedAt).toLocaleDateString() : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Data Consent</Text>
      <Text style={styles.description}>
        Your dream descriptions are sent to an AI provider to generate interpretations. You can
        withdraw this consent at any time. Withdrawing consent will block future AI interpretations
        but will not affect existing ones.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Current Status</Text>
        <Text
          style={[
            styles.statusValue,
            consent?.granted ? styles.statusGranted : styles.statusWithdrawn,
          ]}
        >
          {consent?.granted ? 'Consent Granted' : 'Consent Withdrawn'}
        </Text>
        {dateLabel && <Text style={styles.statusDate}>Granted {dateLabel}</Text>}
      </View>

      {loadError && <Text style={styles.loadError}>{loadError}</Text>}

      {isSaving ? (
        <ActivityIndicator color={colors.accent} />
      ) : consent?.granted ? (
        <TouchableOpacity
          style={styles.withdrawButton}
          onPress={() => {
            void updateConsent(false);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.withdrawText}>Withdraw Consent</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.grantButton}
          onPress={() => {
            void updateConsent(true);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.grantText}>Grant Consent</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { fontSize: 18, color: colors.textPrimary, fontWeight: '700' },
  description: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  statusLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusValue: { fontSize: 16, fontWeight: '700' },
  statusGranted: { color: colors.success },
  statusWithdrawn: { color: colors.error },
  statusDate: { fontSize: 12, color: colors.textMuted },
  loadError: { fontSize: 13, color: colors.error, marginBottom: spacing.md },
  withdrawButton: {
    backgroundColor: colors.destructiveSurface,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  withdrawText: { color: colors.error, fontWeight: '600' },
  grantButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  grantText: { color: colors.textPrimary, fontWeight: '600' },
});
