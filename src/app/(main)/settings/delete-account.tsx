import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../supabase/client';
import { spacing } from '@shared/tokens/spacing';

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
            placeholderTextColor="#444"
            autoCapitalize="characters"
            accessibilityLabel="Type DELETE MY ACCOUNT to confirm"
          />

          <TouchableOpacity
            style={[styles.deleteButton, !isConfirmed && styles.deleteButtonDisabled]}
            onPress={handleConfirmDelete}
            disabled={!isConfirmed || isDeleting}
            accessibilityRole="button"
          >
            {isDeleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteText}>Confirm Delete</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={() => setStep(1)} accessibilityRole="button">
            <Text style={styles.cancelText}>Back</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontSize: 20, color: '#fff', fontWeight: '700' },
  warningCard: { backgroundColor: '#2a1a1a', borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  warningTitle: { fontSize: 16, color: '#e05c5c', fontWeight: '700' },
  warningText: { fontSize: 13, color: '#aaa' },
  bullet: { fontSize: 13, color: '#aaa', marginLeft: spacing.sm },
  proceedButton: { backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#e05c5c', borderRadius: 8, padding: spacing.md, alignItems: 'center' },
  proceedText: { color: '#e05c5c', fontWeight: '600' },
  cancelButton: { alignItems: 'center', padding: spacing.sm },
  cancelText: { color: '#555', fontSize: 14 },
  confirmInstruction: { fontSize: 14, color: '#aaa' },
  phraseHighlight: { color: '#e05c5c', fontWeight: '700', fontFamily: 'monospace' },
  confirmInput: {
    backgroundColor: '#1a1a2e', color: '#fff', borderRadius: 8,
    padding: spacing.md, fontSize: 14, borderWidth: 2, borderColor: '#333',
    fontFamily: 'monospace',
  },
  confirmInputValid: { borderColor: '#e05c5c' },
  deleteButton: { backgroundColor: '#e05c5c', borderRadius: 8, padding: spacing.md, alignItems: 'center' },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  doneContainer: { flex: 1, backgroundColor: '#0d0d1a', alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  doneIcon: { fontSize: 48 },
  doneTitle: { fontSize: 20, color: '#fff', fontWeight: '700', textAlign: 'center' },
  doneText: { fontSize: 14, color: '#aaa', textAlign: 'center', lineHeight: 22 },
});
