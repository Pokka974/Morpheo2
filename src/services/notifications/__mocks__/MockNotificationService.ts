import type { NotificationService } from '../NotificationService';

export class MockNotificationService implements NotificationService {
  private permissionGranted = true;

  setPermissionGranted(value: boolean) {
    this.permissionGranted = value;
    return this;
  }

  async requestPermission(): Promise<boolean> {
    return this.permissionGranted;
  }

  async scheduleReminder(_hour: number, _minute: number): Promise<void> {}

  async cancelReminder(): Promise<void> {}

  async registerPushToken(): Promise<void> {}
}
