import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { InterpretationResult } from '@services/ai/interpretation/InterpretationService';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';

interface Props {
  result: InterpretationResult;
}

export function InterpretationResultView({ result }: Props) {
  const [expandedRef, setExpandedRef] = useState<number | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {result.isDegraded ? (
        <View style={styles.degradedBanner}>
          <Text style={styles.degradedText}>
            This dream had limited detail, so the interpretation may be less precise than usual. It
            reflects general patterns rather than specific symbols.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Interpretation</Text>
        <Text style={styles.reading}>{result.overallReading}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Symbols</Text>
        <View style={styles.chips}>
          {result.keywords.map(kw => (
            <View key={kw} style={styles.chip}>
              <Text style={styles.chipText}>{kw}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emotions</Text>
        <View style={styles.chips}>
          {result.emotions.map(em => (
            <View key={em} style={[styles.chip, styles.emotionChip]}>
              <Text style={[styles.chipText, styles.emotionText]}>{em}</Text>
            </View>
          ))}
        </View>
      </View>

      {result.culturalReferences.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cultural References</Text>
          {result.culturalReferences.map((ref, i) => (
            <TouchableOpacity
              key={i}
              style={styles.accordionItem}
              onPress={() => setExpandedRef(expandedRef === i ? null : i)}
              accessibilityRole="button"
            >
              <View style={styles.accordionHeader}>
                <Text style={styles.accordionSymbol}>{ref.symbol}</Text>
                <Text style={styles.accordionTradition}>{ref.tradition}</Text>
                <Text style={styles.accordionToggle}>{expandedRef === i ? '▲' : '▼'}</Text>
              </View>
              {expandedRef === i ? (
                <Text style={styles.accordionMeaning}>{ref.meaning}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  degradedBanner: {
    backgroundColor: '#2d2d1a',
    borderRadius: 8,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#e0a85c',
  },
  degradedText: {
    color: '#e0c880',
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#6b6882',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  reading: {
    fontSize: fontSize.md,
    color: '#f0eeff',
    lineHeight: 24,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: '#2d2d6b',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    color: '#b399e0',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  emotionChip: {
    backgroundColor: '#2d1a2d',
  },
  emotionText: {
    color: '#e0a8b3',
  },
  accordionItem: {
    backgroundColor: '#1a1a3e',
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accordionSymbol: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#f0eeff',
    flex: 1,
  },
  accordionTradition: {
    fontSize: fontSize.sm,
    color: '#6b6882',
  },
  accordionToggle: {
    color: '#6b6882',
    fontSize: fontSize.sm,
  },
  accordionMeaning: {
    fontSize: fontSize.sm,
    color: '#c8c0e8',
    lineHeight: 20,
  },
});
