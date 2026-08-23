import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../../supabase/client';
import { colors, spacing } from '@theme/tokens';

export default function ExportScreen() {
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
    <View style={styles.container}>
      <Text style={styles.title}>Export My Data</Text>
      <Text style={styles.description}>
        Export all your dreams and interpretations as a JSON file. We&apos;ll email you a download
        link when it&apos;s ready.
      </Text>
      <Text style={styles.description}>
        The export includes: all dream entries, all AI interpretations, and recurrence patterns.
        Generated media is not included.
      </Text>

      {exported ? (
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Export Queued</Text>
          <Text style={styles.successText}>
            We&apos;ll email you when your data export is ready.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.exportButton, isExporting && styles.disabled]}
          onPress={() => {
            void handleExport();
          }}
          disabled={isExporting}
          accessibilityRole="button"
        >
          {isExporting ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.exportText}>Export My Data</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { fontSize: 18, color: colors.textPrimary, fontWeight: '700' },
  description: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  exportButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  exportText: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  successCard: {
    backgroundColor: colors.successSurface,
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  successIcon: { fontSize: 32, color: colors.success },
  successTitle: { fontSize: 16, color: colors.success, fontWeight: '700' },
  successText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
