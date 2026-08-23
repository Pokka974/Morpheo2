import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../supabase/client';
import { Button } from '@shared/components/Button';
import { CheckIcon } from '@shared/components/icons';
import { colors, radius, spacing, typography } from '@theme/tokens';

export default function ExportScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = (await supabase.functions.invoke<unknown>('export-data')) as {
        error: unknown;
      };
      if (!response.error) setExported(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.title}>{t('settingsExport.title')}</Text>
      <Text style={styles.description}>{t('settingsExport.description1')}</Text>
      <Text style={styles.description}>{t('settingsExport.description2')}</Text>

      {exported ? (
        <View style={styles.successCard}>
          <CheckIcon />
          <Text style={styles.successTitle}>{t('settingsExport.queuedTitle')}</Text>
          <Text style={styles.successText}>{t('settingsExport.queuedBody')}</Text>
        </View>
      ) : (
        <Button
          label={t('settingsExport.cta')}
          onPress={() => {
            void handleExport();
          }}
          loading={isExporting}
          fullWidth
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { ...typography.screenTitle, fontSize: 22 },
  description: { ...typography.meta, fontSize: 13, lineHeight: 20 },
  successCard: {
    backgroundColor: colors.successSurface,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  successTitle: { ...typography.cardTitle, color: colors.success },
  successText: { ...typography.meta, textAlign: 'center' },
});
