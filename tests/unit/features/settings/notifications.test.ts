import { ExpoNotificationService } from '@services/notifications/ExpoNotificationService';
import * as Notifications from 'expo-notifications';

const mockGetUser = jest.fn();
const mockEq = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'token' }),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

jest.mock('expo-device', () => ({ isDevice: true }));

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: jest.fn().mockReturnValue({ update: mockUpdate }),
  },
}));

const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

describe('Notification settings (unit)', () => {
  let service: ExpoNotificationService;

  beforeEach(() => {
    service = new ExpoNotificationService();
    jest.clearAllMocks();
    mockCancel.mockResolvedValue(undefined);
    mockSchedule.mockResolvedValue('id');
  });

  it('enabling notifications schedules a daily trigger at the specified time', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    await service.scheduleReminder(8, 30);
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ hour: 8, minute: 30 }),
      })
    );
  });

  it('disabling notifications cancels all scheduled reminders', async () => {
    await service.cancelReminder();
    expect(mockCancel).toHaveBeenCalledWith('morpheo-daily-reminder');
  });

  it('permission denial returns false and does not schedule', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    const result = await service.requestPermission();
    expect(result).toBe(false);
  });

  it('permission denial shows guidance — does not throw', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });
    await expect(service.requestPermission()).resolves.toBe(false);
  });

  it('rescheduling updates the daily trigger time', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    await service.scheduleReminder(8, 0);
    await service.scheduleReminder(9, 15);
    expect(mockCancel).toHaveBeenCalledTimes(2);
    expect(mockSchedule.mock.calls[1][0].trigger.hour).toBe(9);
    expect(mockSchedule.mock.calls[1][0].trigger.minute).toBe(15);
  });
});
