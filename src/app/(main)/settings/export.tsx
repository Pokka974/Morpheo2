import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../../supabase/client';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

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
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.exportText}>Export My Data</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a', padding: spacing.md, gap: spacing.md },
  title: { fontSize: 18, color: '#fff', fontWeight: '700' },
  description: { fontSize: 13, color: '#aaa', lineHeight: 20 },
  exportButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  exportText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  successCard: {
    backgroundColor: '#1a2e1a',
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  successIcon: { fontSize: 32, color: '#6bcb6b' },
  successTitle: { fontSize: 16, color: '#6bcb6b', fontWeight: '700' },
  successText: { fontSize: 13, color: '#aaa', textAlign: 'center' },
});
