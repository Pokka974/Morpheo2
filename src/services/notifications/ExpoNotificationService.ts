import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../../supabase/client';
import type { NotificationService } from './NotificationService';

const REMINDER_CHANNEL_ID = 'dream-reminder';
const REMINDER_IDENTIFIER = 'morpheo-daily-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export class ExpoNotificationService implements NotificationService {
  async requestPermission(): Promise<boolean> {
    if (!Device.isDevice) return false;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  async scheduleReminder(hour: number, minute: number): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title: 'Remember your dreams?',
        body: 'Log a dream before the details fade.',
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }

  async cancelReminder(): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => {});
  }

  async registerPushToken(): Promise<void> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('profiles')
      .update({ push_token: tokenData.data })
      .eq('id', user.id);
  }
}
