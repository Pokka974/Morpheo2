import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/components/Button';
import { SegmentedControl } from '@shared/components/SegmentedControl';
import { EmotionPicker } from '@features/dream-log/EmotionPicker';
import { colors, radius, spacing, typography } from '@theme/tokens';
import type { JournalFilters } from '@features/journal/useJournalFilters';

/**
 * The periods the journal offers, matching the vocabulary Insights already uses so a
 * dreamer meets "30 d / 90 d / All" in one form throughout the app.
 */
export const FILTER_PERIODS = ['all', '30', '90'] as const;
export type FilterPeriod = (typeof FILTER_PERIODS)[number];

export const PERIOD_KEYS: Record<FilterPeriod, string> = {
  all: 'insights.periodAll',
  '30': 'insights.period30',
  '90': 'insights.period90',
};

const PERIOD_LABEL_KEYS: Record<FilterPeriod, string> = {
  all: 'insights.periodLabelAll',
  '30': 'insights.periodLabel30',
  '90': 'insights.periodLabel90',
};

/**
 * `dreams.occurred_at` is date-only ('2026-08-26'), and the filter compares it as a
 * string — so the bound has to be produced in the same shape, in local time. Going
 * through `toISOString()` would shift the boundary by the UTC offset and silently drop
 * or add a night at the edge of the window.
 */
export function periodStartDate(period: FilterPeriod, now: Date = new Date()): string | undefined {
  if (period === 'all') return undefined;
  const start = new Date(now);
  start.setDate(start.getDate() - Number(period));
  const month = `${start.getMonth() + 1}`.padStart(2, '0');
  const day = `${start.getDate()}`.padStart(2, '0');
  return `${start.getFullYear()}-${month}-${day}`;
}

interface Props {
  visible: boolean;
  /** The filters currently in force, so reopening the sheet shows them rather than a blank slate. */
  filters: JournalFilters;
  /**
   * Which window produced `filters.startDate`. Carried rather than re-derived from the
   * date: the bound is computed relative to "now", so a session left open across
   * midnight would stop matching and the sheet would reopen showing "All" while a
   * 30-day filter was still in force.
   */
  period: FilterPeriod;
  onApply: (filters: JournalFilters, period: FilterPeriod) => void;
  onClear: () => void;
  onCancel: () => void;
}

/**
 * The journal's filter control: one emotion and one time window, which is exactly what
 * `useJournalFilters` can express. Choices are held as a draft and committed on "Apply",
 * so a half-made selection never rewrites the list underneath the sheet.
 */
export function JournalFilterSheet({
  visible,
  filters,
  period: appliedPeriod,
  onApply,
  onClear,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [emotion, setEmotion] = useState<string[]>([]);
  const [period, setPeriod] = useState<FilterPeriod>('all');
  const wasVisible = useRef(false);

  // Re-seed the draft on the closed → open edge only. `filters` is an object the parent
  // may recreate on any render, so syncing on every change would reset an in-progress
  // selection on whatever unrelated re-render happened to land first.
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setEmotion(filters.emotion ? [filters.emotion] : []);
      setPeriod(appliedPeriod);
    }
    wasVisible.current = visible;
  }, [visible, filters, appliedPeriod]);

  if (!visible) return null;

  const isEmpty = emotion.length === 0 && period === 'all';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={styles.scrim}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={spacing.sm}>
            <Text style={styles.sheetAction}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {t('journal.filterTitle')}
          </Text>
          <Pressable
            onPress={onClear}
            disabled={isEmpty}
            accessibilityRole="button"
            accessibilityState={{ disabled: isEmpty }}
            hitSlop={spacing.sm}
            testID="journal-filter-clear"
          >
            <Text
              style={[
                styles.sheetAction,
                isEmpty ? styles.sheetActionInert : styles.sheetActionPrimary,
              ]}
            >
              {t('journal.filterClear')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <EmotionPicker
            selected={emotion}
            onChange={setEmotion}
            heading={t('journal.filterEmotionHeading')}
            singleSelect
            alwaysExpanded
          />

          <View style={styles.section}>
            <Text style={styles.heading}>{t('journal.filterPeriodHeading')}</Text>
            <SegmentedControl
              segments={FILTER_PERIODS.map(value => ({
                value,
                label: t(PERIOD_KEYS[value]),
                accessibilityLabel: t('journal.filterPeriodA11y', {
                  period: t(PERIOD_LABEL_KEYS[value]),
                }),
              }))}
              value={period}
              onChange={setPeriod}
              fullWidth
              testID="journal-filter-period"
            />
          </View>

          <Button
            label={t('journal.filterApply')}
            onPress={() =>
              onApply({ emotion: emotion[0], startDate: periodStartDate(period) }, period)
            }
            fullWidth
            testID="journal-filter-apply"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    ...typography.cardTitle,
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
  },
  sheetAction: {
    ...typography.chip,
    color: colors.textMuted,
  },
  sheetActionPrimary: {
    color: colors.accentText,
  },
  sheetActionInert: {
    opacity: 0.4,
  },
  body: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  section: {
    gap: 10,
  },
  heading: {
    ...typography.overline,
  },
});
