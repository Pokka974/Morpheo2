import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useServices } from '@services/useServices';
import { supabase } from '../../../supabase/client';
import { colors, radius, spacing, typography } from '@theme/tokens';

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { notifications } = useServices();
  const [enabled, setEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_reminders_enabled, notification_reminder_time')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Failed to load notification preferences:', error);
        return;
      }
      const row = data as {
        notification_reminders_enabled: boolean | null;
        notification_reminder_time: string | null;
      } | null;
      if (row) {
        setEnabled(row.notification_reminders_enabled ?? false);
        if (row.notification_reminder_time) {
          const parts = row.notification_reminder_time.split(':').map(Number);
          const h = parts[0] ?? 8;
          const m = parts[1] ?? 0;
          const d = new Date();
          d.setHours(h, m, 0, 0);
          setReminderTime(d);
        }
      }
    });
  }, []);

  const handleToggle = async (value: boolean) => {
    setEnabled(value);
    if (value) {
      const granted = await notifications.requestPermission();
      if (!granted) {
        setEnabled(false);
        Alert.alert(
          t('settingsNotifications.permissionDeniedTitle'),
          t('settingsNotifications.permissionDeniedBody')
        );
        return;
      }
      await notifications.scheduleReminder(reminderTime.getHours(), reminderTime.getMinutes());
    } else {
      await notifications.cancelReminder();
    }
    await persistPreferences(value, reminderTime);
  };

  const handleTimeChange = async (_: unknown, date?: Date) => {
    setShowPicker(false);
    if (!date) return;
    setReminderTime(date);
    if (enabled) {
      await notifications.scheduleReminder(date.getHours(), date.getMinutes());
    }
    await persistPreferences(enabled, date);
  };

  const persistPreferences = async (isEnabled: boolean, time: Date) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    const { error } = await supabase
      .from('profiles')
      .update({
        notification_reminders_enabled: isEnabled,
        notification_reminder_time: timeStr,
      })
      .eq('id', user.id);
    if (error) {
      console.error('Failed to save notification preferences:', error);
      Alert.alert(
        t('settingsNotifications.saveErrorTitle'),
        t('settingsNotifications.saveErrorBody')
      );
    }
  };

  const timeLabel = reminderTime.toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.title}>{t('settingsNotifications.title')}</Text>

      <View style={styles.row}>
        <View style={styles.labelBlock}>
          <Text style={styles.label}>{t('settingsNotifications.dailyReminderLabel')}</Text>
          <Text style={styles.sublabel}>{t('settingsNotifications.dailyReminderSubtitle')}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={value => {
            void handleToggle(value);
          }}
          trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
          thumbColor={colors.textPrimary}
          accessibilityLabel={t('settingsNotifications.dailyReminderA11y')}
        />
      </View>

      {enabled && (
        <View style={styles.row}>
          <Text style={styles.label}>{t('settingsNotifications.reminderTimeLabel')}</Text>
          <Text style={styles.timeValue} onPress={() => setShowPicker(true)}>
            {timeLabel}
          </Text>
        </View>
      )}

      {showPicker && (
        <DateTimePicker
          value={reminderTime}
          mode="time"
          display="spinner"
          onChange={(event, date) => {
            void handleTimeChange(event, date);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { ...typography.screenTitle, fontSize: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  labelBlock: { flex: 1, gap: 2 },
  label: { ...typography.body, color: colors.textSecondary },
  sublabel: { ...typography.meta },
  timeValue: {
    ...typography.body,
    color: colors.accentText,
    fontFamily: typography.cardTitle.fontFamily,
  },
});
