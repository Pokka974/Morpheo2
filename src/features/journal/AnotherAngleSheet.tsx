import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@shared/components/Button';
import { colors, radius, spacing, typography } from '@theme/tokens';
import type { InterpretationRequest } from '@services/ai/interpretation/InterpretationService';

type Style = NonNullable<InterpretationRequest['style']>;

const STYLE_ORDER: Style[] = ['symbolic', 'mythological', 'psychological'];

/** Same three account-level styles `settings/style.tsx` offers — same type, same i18n
 * labels — this is a one-off override for a single re-reading, not a new taxonomy. */
const STYLE_LABEL_KEYS: Record<Style, string> = {
  symbolic: 'settingsStyle.symbolicLabel',
  mythological: 'settingsStyle.mythologicalLabel',
  psychological: 'settingsStyle.psychologicalLabel',
};

interface AnotherAngleSheetProps {
  visible: boolean;
  selectedStyle: Style;
  onSelectStyle: (style: Style) => void;
  /** Images-left pattern mirrored for interpretations — `null` hides the caption
   * entirely (premium/unlimited), same convention as `DreamImageActionBar`. */
  interpretationsRemaining: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Gates "Another angle": the first reading stays, and this picks which reading grid
 * the new one uses before firing it. Bottom-sheet structure follows
 * `DateTimePickerSheet` (real Modal, backdrop dismiss, `radius.sheet` corners).
 */
export function AnotherAngleSheet({
  visible,
  selectedStyle,
  onSelectStyle,
  interpretationsRemaining,
  onConfirm,
  onCancel,
}: AnotherAngleSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={styles.scrim}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t('dream.anotherAngleSheetTitle')}</Text>
        <Text style={styles.body}>{t('dream.anotherAngleSheetBody')}</Text>
        <View style={styles.chipRow}>
          {STYLE_ORDER.map(value => {
            const isSelected = value === selectedStyle;
            return (
              <Pressable
                key={value}
                onPress={() => onSelectStyle(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                style={[styles.chip, isSelected && styles.chipSelected]}
              >
                <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                  {t(STYLE_LABEL_KEYS[value])}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.actions}>
          <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} />
          <Button
            label={t('dream.rereadFromAngle')}
            onPress={onConfirm}
            style={styles.flexAction}
          />
        </View>
        {interpretationsRemaining !== null ? (
          <Text style={styles.caption}>
            {t('dream.interpretationsRemainingCaption', { count: interpretationsRemaining })}
          </Text>
        ) : null}
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
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.borderElevated,
    alignSelf: 'center',
  },
  title: {
    ...typography.dreamTitle,
    fontSize: 20,
  },
  body: {
    ...typography.meta,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderElevated,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipLabel: {
    ...typography.chip,
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.textOnAccent,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  flexAction: {
    flex: 1,
  },
  caption: {
    ...typography.meta,
    textAlign: 'center',
  },
});
