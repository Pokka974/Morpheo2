import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../../supabase/client';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

interface ConsentState {
  granted: boolean;
  updatedAt: string | null;
}

export default function PrivacyScreen() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConsent();
  }, []);

  const loadConsent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('ai_consent_granted, ai_consent_updated_at')
      .eq('id', user.id)
      .single();
    if (data) {
      setConsent({ granted: data.ai_consent_granted ?? false, updatedAt: data.ai_consent_updated_at });
    }
  };

  const updateConsent = async (granted: boolean) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const now = new Date().toISOString();
      await supabase.from('profiles').update({
        ai_consent_granted: granted,
        ai_consent_updated_at: now,
      }).eq('id', user.id);
      await supabase.from('consent_records').insert({
        user_id: user.id,
        consent_type: 'ai_interpretation',
        granted,
        recorded_at: now,
      });
      setConsent({ granted, updatedAt: now });
    } finally {
      setIsSaving(false);
    }
  };

  const dateLabel = consent?.updatedAt
    ? new Date(consent.updatedAt).toLocaleDateString()
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Data Consent</Text>
      <Text style={styles.description}>
        Your dream descriptions are sent to an AI provider to generate interpretations.
        You can withdraw this consent at any time. Withdrawing consent will block future
        AI interpretations but will not affect existing ones.
      </Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Current Status</Text>
        <Text style={[styles.statusValue, consent?.granted ? styles.statusGranted : styles.statusWithdrawn]}>
          {consent?.granted ? 'Consent Granted' : 'Consent Withdrawn'}
        </Text>
        {dateLabel && <Text style={styles.statusDate}>Updated {dateLabel}</Text>}
      </View>

      {isSaving ? (
        <ActivityIndicator color={colors.primary} />
      ) : consent?.granted ? (
        <TouchableOpacity
          style={styles.withdrawButton}
          onPress={() => updateConsent(false)}
          accessibilityRole="button"
        >
          <Text style={styles.withdrawText}>Withdraw Consent</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.grantButton}
          onPress={() => updateConsent(true)}
          accessibilityRole="button"
        >
          <Text style={styles.grantText}>Grant Consent</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a', padding: spacing.md, gap: spacing.md },
  title: { fontSize: 18, color: '#fff', fontWeight: '700' },
  description: { fontSize: 13, color: '#aaa', lineHeight: 20 },
  statusCard: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  statusLabel: { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusValue: { fontSize: 16, fontWeight: '700' },
  statusGranted: { color: '#6bcb6b' },
  statusWithdrawn: { color: '#e05c5c' },
  statusDate: { fontSize: 12, color: '#555' },
  withdrawButton: { backgroundColor: '#2a1a1a', borderWidth: 1, borderColor: '#e05c5c', borderRadius: 8, padding: spacing.md, alignItems: 'center' },
  withdrawText: { color: '#e05c5c', fontWeight: '600' },
  grantButton: { backgroundColor: colors.primary, borderRadius: 8, padding: spacing.md, alignItems: 'center' },
  grantText: { color: '#fff', fontWeight: '600' },
});
