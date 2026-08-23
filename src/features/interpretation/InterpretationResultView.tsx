import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { InterpretationResult } from '@services/ai/interpretation/InterpretationService';
import { Chip, ChipRow } from '@shared/components/Chip';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  result: InterpretationResult;
}

export function InterpretationResultView({ result }: Props) {
  const { t } = useTranslation();
  const [expandedRef, setExpandedRef] = useState<number | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {result.isDegraded ? (
        <View style={styles.degradedBanner}>
          <Text style={styles.degradedText}>{t('dream.degradedNotice')}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dream.interpretation')}</Text>
        <Text style={styles.reading}>{result.overallReading}</Text>
      </View>

      {result.keywords.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dream.symbols')}</Text>
          <ChipRow>
            {result.keywords.map(kw => (
              <Chip key={kw} label={kw} variant="keyword" />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {result.emotions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dream.emotions')}</Text>
          <ChipRow>
            {result.emotions.map(em => (
              <Chip key={em} label={em} />
            ))}
          </ChipRow>
        </View>
      ) : null}

      {result.culturalReferences.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dream.culturalReferences')}</Text>
          {result.culturalReferences.map((ref, i) => (
            <TouchableOpacity
              key={i}
              style={styles.accordionItem}
              onPress={() => setExpandedRef(expandedRef === i ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ expanded: expandedRef === i }}
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
    padding: spacing.md,
    gap: spacing.lg,
  },
  degradedBanner: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  degradedText: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.overline,
  },
  reading: {
    ...typography.interpretationBody,
  },
  accordionItem: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accordionSymbol: {
    ...typography.cardTitle,
    fontSize: 15,
    flex: 1,
  },
  accordionTradition: {
    ...typography.meta,
    fontSize: 12,
    color: colors.accentText,
  },
  accordionToggle: {
    ...typography.meta,
    fontSize: 10,
  },
  accordionMeaning: {
    ...typography.dreamBody,
    marginTop: spacing.sm,
  },
});
