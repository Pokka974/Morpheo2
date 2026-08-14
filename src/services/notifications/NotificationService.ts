export interface NotificationService {
  requestPermission(): Promise<boolean>;
  scheduleReminder(hour: number, minute: number): Promise<void>;
  cancelReminder(): Promise<void>;
  registerPushToken(): Promise<void>;
}
