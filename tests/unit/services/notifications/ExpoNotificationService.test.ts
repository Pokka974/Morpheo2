import { ExpoNotificationService } from '@services/notifications/ExpoNotificationService';
import * as Notifications from 'expo-notifications';

const mockGetUser = jest.fn();
const mockEq = jest.fn();

// setNotificationHandler is called at module load time in ExpoNotificationService.ts.
// Using inline jest.fn() to avoid the jest.mock hoisting issue where outer variables
// would be undefined when the factory runs before variable initializations.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  PermissionStatus: { GRANTED: 'granted', UNDETERMINED: 'undetermined', DENIED: 'denied' },
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    // Use arrow functions (not jest.fn) for the chain so clearAllMocks doesn't reset return values
    from: () => ({ update: () => ({ eq: mockEq }) }),
  },
}));

const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockGetExpoPushToken = Notifications.getExpoPushTokenAsync as jest.Mock;

describe('ExpoNotificationService', () => {
  let service: ExpoNotificationService;

  beforeEach(() => {
    service = new ExpoNotificationService();
    jest.clearAllMocks();
    mockCancel.mockResolvedValue(undefined);
    mockEq.mockResolvedValue({});
  });

  describe('requestPermission', () => {
    it('returns true when permission already granted', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'granted' });
      const result = await service.requestPermission();
      expect(result).toBe(true);
      expect(mockRequestPermissions).not.toHaveBeenCalled();
    });

    it('requests permission when not yet granted', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissions.mockResolvedValue({ status: 'granted' });
      const result = await service.requestPermission();
      expect(result).toBe(true);
      expect(mockRequestPermissions).toHaveBeenCalled();
    });

    it('returns false when permission denied', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
      mockRequestPermissions.mockResolvedValue({ status: 'denied' });
      const result = await service.requestPermission();
      expect(result).toBe(false);
    });
  });

  describe('scheduleReminder', () => {
    it('cancels existing and schedules new daily reminder', async () => {
      mockSchedule.mockResolvedValue('identifier');
      await service.scheduleReminder(8, 0);
      expect(mockCancel).toHaveBeenCalledWith('morpheo-daily-reminder');
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'morpheo-daily-reminder',
          trigger: expect.objectContaining({ hour: 8, minute: 0 }),
        })
      );
    });
  });

  describe('cancelReminder', () => {
    it('cancels the scheduled reminder', async () => {
      await service.cancelReminder();
      expect(mockCancel).toHaveBeenCalledWith('morpheo-daily-reminder');
    });
  });

  describe('registerPushToken', () => {
    it('stores push token in profiles when permission granted', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'granted' });
      mockGetExpoPushToken.mockResolvedValue({ data: 'ExponentPushToken[xxx]' });
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-001' } } });

      await service.registerPushToken();

      expect(mockGetExpoPushToken).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', 'user-001');
    });

    it('does nothing when no user session', async () => {
      mockGetPermissions.mockResolvedValue({ status: 'granted' });
      mockGetExpoPushToken.mockResolvedValue({ data: 'ExponentPushToken[xxx]' });
      mockGetUser.mockResolvedValue({ data: { user: null } });

      await service.registerPushToken();
      expect(mockEq).not.toHaveBeenCalled();
    });
  });
});
