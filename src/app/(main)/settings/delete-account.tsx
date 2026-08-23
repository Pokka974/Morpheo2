import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../supabase/client';
import { Button } from '@shared/components/Button';
import { TrashIcon, WarningIcon } from '@shared/components/icons';
import { colors, radius, spacing, typography } from '@theme/tokens';

// Exact confirmation string per contracts/api-endpoints.md (C1 fix). Never translated —
// the Edge Function matches this literal string regardless of the device's language.
const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.doneContainer, { paddingTop: insets.top }]}>
        <TrashIcon size={40} />
        <Text style={styles.doneTitle}>{t('settingsDeleteAccount.doneTitle')}</Text>
        <Text style={styles.doneText}>{t('settingsDeleteAccount.doneBody')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
    >
      <Text style={styles.title}>{t('settingsDeleteAccount.title')}</Text>

      {step === 1 ? (
        <>
          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <WarningIcon size={20} />
              <Text style={styles.warningTitle}>{t('settingsDeleteAccount.warningTitle')}</Text>
            </View>
            <Text style={styles.warningText}>{t('settingsDeleteAccount.warningIntro')}</Text>
            <Text style={styles.bullet}>• {t('settingsDeleteAccount.bullet1')}</Text>
            <Text style={styles.bullet}>• {t('settingsDeleteAccount.bullet2')}</Text>
            <Text style={styles.bullet}>• {t('settingsDeleteAccount.bullet3')}</Text>
            <Text style={styles.bullet}>• {t('settingsDeleteAccount.bullet4')}</Text>
          </View>

          <Button
            label={t('settingsDeleteAccount.proceed')}
            variant="secondary"
            onPress={() => setStep(2)}
            style={styles.proceedButton}
            fullWidth
          />

          <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Text style={styles.confirmInstruction}>
            {t('settingsDeleteAccount.confirmInstructionPrefix')}{' '}
            <Text style={styles.phraseHighlight}>{CONFIRMATION_PHRASE}</Text>{' '}
            {t('settingsDeleteAccount.confirmInstructionSuffix')}
          </Text>
          <TextInput
            style={[styles.confirmInput, isConfirmed && styles.confirmInputValid]}
            value={confirmationText}
            onChangeText={setConfirmationText}
            placeholder={CONFIRMATION_PHRASE}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            accessibilityLabel={t('settingsDeleteAccount.confirmAccessibilityLabel', {
              phrase: CONFIRMATION_PHRASE,
            })}
          />

          <Button
            label={t('settingsDeleteAccount.confirmDelete')}
            onPress={() => {
              void handleConfirmDelete();
            }}
            disabled={!isConfirmed}
            loading={isDeleting}
            style={styles.deleteButton}
            fullWidth
          />

          <Button label={t('common.back')} variant="ghost" onPress={() => setStep(1)} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...typography.screenTitle },
  warningCard: {
    backgroundColor: colors.destructiveSurface,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningTitle: { ...typography.cardTitle, fontSize: 16, color: colors.error },
  warningText: { ...typography.meta, fontSize: 13 },
  bullet: { ...typography.meta, fontSize: 13, marginLeft: spacing.sm },
  proceedButton: {
    backgroundColor: colors.destructiveSurfaceStrong,
    borderColor: colors.error,
  },
  confirmInstruction: { ...typography.meta, fontSize: 14 },
  phraseHighlight: {
    color: colors.error,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  confirmInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    borderRadius: radius.button,
    padding: spacing.md,
    fontSize: 14,
    borderWidth: 2,
    borderColor: colors.border,
    fontFamily: 'monospace',
  },
  confirmInputValid: { borderColor: colors.error },
  deleteButton: {
    backgroundColor: colors.error,
  },
  doneContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  doneTitle: { ...typography.screenTitle, fontSize: 20, textAlign: 'center' },
  doneText: { ...typography.meta, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
