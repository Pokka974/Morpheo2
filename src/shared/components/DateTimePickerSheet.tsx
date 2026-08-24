import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  visible: boolean;
  mode: 'date' | 'time';
  value: Date;
  title: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
}

/**
 * A themed wrapper around the community date/time picker.
 *
 * Android's picker is already a self-contained native dialog that closes itself
 * on `onChange` — wrapping it further would just add a redundant layer, so on
 * Android this renders the bare control and treats the single `onChange` as the
 * whole interaction (`'set'` commits, anything else cancels).
 *
 * iOS's inline/spinner displays are not dialogs: `onChange` fires continuously as
 * the user scrolls or taps a calendar day, with no built-in "confirmed" signal.
 * Committing on the first `onChange` there closed the sheet before a scroll had
 * settled, which read as the control "not working" at all. iOS instead holds the
 * in-progress value in `draft` and only commits it on an explicit "Done", inside a
 * themed bottom sheet — `themeVariant="dark"` matters on its own: without it the
 * control follows system light/dark appearance rather than the app's, and can
 * render dark-on-dark text that is present but unreadable against this app's
 * always-dark background.
 */
export function DateTimePickerSheet({
  visible,
  mode,
  value,
  title,
  onConfirm,
  onCancel,
  minimumDate,
  maximumDate,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const wasVisible = useRef(false);

  // Re-syncs the draft only at the moment the sheet *opens* (the false → true
  // edge), not on every render where `value` happens to be a new object
  // reference — a caller passing e.g. `state ?? new Date()` inline produces a
  // fresh Date every render, and resetting on every `value` change would
  // overwrite an in-progress scroll on whatever unrelated re-render landed
  // mid-gesture, which read as the control "not working" at all.
  useEffect(() => {
    if (visible && !wasVisible.current) setDraft(value);
    wasVisible.current = visible;
  }, [visible, value]);

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        testID="date-time-picker"
        value={value}
        mode={mode}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onConfirm(date);
          else onCancel();
        }}
      />
    );
  }

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
            {title}
          </Text>
          <Pressable
            onPress={() => onConfirm(draft)}
            accessibilityRole="button"
            hitSlop={spacing.sm}
          >
            <Text style={[styles.sheetAction, styles.sheetActionPrimary]}>{t('common.save')}</Text>
          </Pressable>
        </View>
        <DateTimePicker
          testID="date-time-picker"
          value={draft}
          mode={mode}
          display={mode === 'date' ? 'inline' : 'spinner'}
          themeVariant="dark"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_event, date) => {
            if (date) setDraft(date);
          }}
        />
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
    paddingBottom: spacing.lg,
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
});
