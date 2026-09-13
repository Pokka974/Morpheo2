import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface DeleteDreamModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Delete never carries the brand purple — a garnet-adjacent confirm, using the same
 * destructive palette `settings/delete-account.tsx` already established, naming what
 * disappears before committing to it. Replaces the OS `Alert.alert` this screen used to
 * use, matching the app's own custom-card convention elsewhere (`ConsentPromptModal`).
 */
export function DeleteDreamModal({ visible, onConfirm, onCancel }: DeleteDreamModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('dream.deleteConfirmTitle')}</Text>
          <Text style={styles.body}>{t('dream.deleteConfirmBody')}</Text>
          <View style={styles.actions}>
            <Button
              label={t('dream.deletePermanently')}
              variant="destructive"
              onPress={onConfirm}
              fullWidth
            />
            <Button label={t('dream.keepDream')} variant="ghost" onPress={onCancel} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.dreamTitle,
    fontSize: 20,
  },
  body: {
    ...typography.body,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.sm,
  },
});
