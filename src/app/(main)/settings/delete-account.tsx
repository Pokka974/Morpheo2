import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../supabase/client';
import { colors, spacing } from '@theme/tokens';

// Exact confirmation string per contracts/api-endpoints.md (C1 fix)
const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const isConfirmed = confirmationText === CONFIRMATION_PHRASE;

  const handleConfirmDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      await supabase.functions.invoke('account-delete', {
        body: { confirmation: CONFIRMATION_PHRASE },
      });
      await supabase.auth.signOut();
      setDeleted(true);
    } finally {
      setIsDeleting(false);
    }
  };

  if (deleted) {
    return (
      <View style={styles.doneContainer}>
        <Text style={styles.doneIcon}>🗑</Text>
        <Text style={styles.doneTitle}>Account Deletion Scheduled</Text>
        <Text style={styles.doneText}>
          Your account has been signed out. Your data will be fully removed within 30 days.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Delete Account</Text>

      {step === 1 ? (
        <>
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠️ This cannot be undone</Text>
            <Text style={styles.warningText}>Deleting your account will:</Text>
            <Text style={styles.bullet}>• Permanently delete all your dream entries</Text>
            <Text style={styles.bullet}>• Remove all AI interpretations and generated media</Text>
            <Text style={styles.bullet}>• Cancel your premium subscription</Text>
            <Text style={styles.bullet}>• All data is removed within 30 days</Text>
          </View>

          <TouchableOpacity
            style={styles.proceedButton}
            onPress={() => setStep(2)}
            accessibilityRole="button"
          >
            <Text style={styles.proceedText}>I Understand — Proceed</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.confirmInstruction}>
            Type <Text style={styles.phraseHighlight}>{CONFIRMATION_PHRASE}</Text> to confirm:
          </Text>
          <TextInput
            style={[styles.confirmInput, isConfirmed && styles.confirmInputValid]}
            value={confirmationText}
            onChangeText={setConfirmationText}
            placeholder={CONFIRMATION_PHRASE}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            accessibilityLabel="Type DELETE MY ACCOUNT to confirm"
          />

          <TouchableOpacity
            style={[styles.deleteButton, !isConfirmed && styles.deleteButtonDisabled]}
            onPress={() => {
              void handleConfirmDelete();
            }}
            disabled={!isConfirmed || isDeleting}
            accessibilityRole="button"
          >
            {isDeleting ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.deleteText}>Confirm Delete</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setStep(1)}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Back</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 20, color: colors.textPrimary, fontWeight: '700' },
  warningCard: {
    backgroundColor: colors.destructiveSurface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  warningTitle: { fontSize: 16, color: colors.error, fontWeight: '700' },
  warningText: { fontSize: 13, color: colors.textMuted },
  bullet: { fontSize: 13, color: colors.textMuted, marginLeft: spacing.sm },
  proceedButton: {
    backgroundColor: colors.destructiveSurfaceStrong,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  proceedText: { color: colors.error, fontWeight: '600' },
  cancelButton: { alignItems: 'center', padding: spacing.sm },
  cancelText: { color: colors.textMuted, fontSize: 14 },
  confirmInstruction: { fontSize: 14, color: colors.textMuted },
  phraseHighlight: { color: colors.error, fontWeight: '700', fontFamily: 'monospace' },
  confirmInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 14,
    borderWidth: 2,
    borderColor: colors.border,
    fontFamily: 'monospace',
  },
  confirmInputValid: { borderColor: colors.error },
  deleteButton: {
    backgroundColor: colors.error,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteText: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  doneContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  doneIcon: { fontSize: 48 },
  doneTitle: { fontSize: 20, color: colors.textPrimary, fontWeight: '700', textAlign: 'center' },
  doneText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
