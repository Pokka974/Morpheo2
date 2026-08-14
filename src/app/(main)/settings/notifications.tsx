import React, { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useServices } from '@services/useServices';
import { supabase } from '../../../supabase/client';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';

export default function NotificationsScreen() {
  const { notifications } = useServices();
  const [enabled, setEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('notification_reminders_enabled, notification_reminder_time')
        .eq('id', user.id)
        .single();
      if (data) {
        setEnabled(data.notification_reminders_enabled ?? false);
        if (data.notification_reminder_time) {
          const parts = (data.notification_reminder_time as string).split(':').map(Number);
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
        Alert.alert('Permission Required', 'Please enable notifications in your device settings.');
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    await supabase.from('profiles').update({
      notification_reminders_enabled: isEnabled,
      notification_reminder_time: timeStr,
    }).eq('id', user.id);
  };

  const timeLabel = reminderTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.labelBlock}>
          <Text style={styles.label}>Daily Dream Reminder</Text>
          <Text style={styles.sublabel}>A gentle morning prompt to log your dreams</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ true: colors.primary }}
          accessibilityLabel="Enable daily dream reminder"
        />
      </View>

      {enabled && (
        <View style={styles.row}>
          <Text style={styles.label}>Reminder Time</Text>
          <Text style={styles.timeValue} onPress={() => setShowPicker(true)}>{timeLabel}</Text>
        </View>
      )}

      {showPicker && (
        <DateTimePicker
          value={reminderTime}
          mode="time"
          display="spinner"
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a', padding: spacing.md, gap: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a2e', borderRadius: 12, padding: spacing.md,
  },
  labelBlock: { flex: 1, gap: 2 },
  label: { fontSize: 15, color: '#ddd' },
  sublabel: { fontSize: 12, color: '#666' },
  timeValue: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
