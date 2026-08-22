import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ServicesProvider } from '@services/ServicesProvider';
import { MockAuthService } from '@services/auth/__mocks__/MockAuthService';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';
import { MockImageGenerationService } from '@services/ai/image/__mocks__/MockImageGenerationService';
import { MockVideoGenerationService } from '@services/ai/video/__mocks__/MockVideoGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { MockEntitlementService } from '@services/entitlement/__mocks__/MockEntitlementService';
import { MockNotificationService } from '@services/notifications/__mocks__/MockNotificationService';
import type { ServiceRegistry } from '@services/registry';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

const mockGetUser = jest.fn();
const mockSingle = jest.fn();
const mockUpdateEq = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: mockSingle })) })),
      update: jest.fn(() => ({ eq: mockUpdateEq })),
    })),
  },
}));

import NotificationsScreen from '@app/(main)/settings/notifications';

function buildRegistry(notifications: MockNotificationService): ServiceRegistry {
  return {
    auth: new MockAuthService(),
    localLock: new MockLocalLockService(),
    interpretation: new MockInterpretationService(),
    imageGeneration: new MockImageGenerationService(),
    videoGeneration: new MockVideoGenerationService(),
    storage: new MockStorageService(),
    entitlement: new MockEntitlementService(),
    notifications,
  };
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockReset().mockResolvedValue({ data: null });
    mockUpdateEq.mockReset().mockResolvedValue({});
  });

  it('loads with reminders enabled + a saved time: switch is on and a time row renders', async () => {
    mockSingle.mockResolvedValue({
      data: { notification_reminders_enabled: true, notification_reminder_time: '08:30' },
    });
    const notifications = new MockNotificationService();
    const { getByLabelText, getByText } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByLabelText('Enable daily dream reminder').props.value).toBe(true));
    expect(getByText(/\d{1,2}:\d{2}/)).toBeTruthy();
  });

  it('loads with no profile data: stays disabled and shows no reminder-time row', async () => {
    mockSingle.mockResolvedValue({ data: null });
    const { getByLabelText, queryByText } = render(
      <ServicesProvider services={buildRegistry(new MockNotificationService())}>
        <NotificationsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(getByLabelText('Enable daily dream reminder').props.value).toBe(false);
    expect(queryByText('Reminder Time')).toBeNull();
  });

  it('loads with enabled=true but no saved reminder time: falls back to the default time and still shows the row', async () => {
    mockSingle.mockResolvedValue({ data: { notification_reminders_enabled: true } });
    const { getByText, getByLabelText } = render(
      <ServicesProvider services={buildRegistry(new MockNotificationService())}>
        <NotificationsScreen />
      </ServicesProvider>
    );

    await waitFor(() => expect(getByLabelText('Enable daily dream reminder').props.value).toBe(true));
    expect(getByText('Reminder Time')).toBeTruthy();
  });

  it('toggling on with permission granted schedules a reminder and persists the preference', async () => {
    const notifications = new MockNotificationService();
    const scheduleSpy = jest.spyOn(notifications, 'scheduleReminder');
    const { getByLabelText } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    await act(async () => {
      fireEvent(getByLabelText('Enable daily dream reminder'), 'valueChange', true);
    });

    await waitFor(() => expect(scheduleSpy).toHaveBeenCalledTimes(1));
    expect(mockUpdateEq).toHaveBeenCalled();
    expect(getByLabelText('Enable daily dream reminder').props.value).toBe(true);
  });

  it('toggling on with permission denied reverts the switch and shows an alert', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    const notifications = new MockNotificationService().setPermissionGranted(false);
    const scheduleSpy = jest.spyOn(notifications, 'scheduleReminder');
    const { getByLabelText } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    await act(async () => {
      fireEvent(getByLabelText('Enable daily dream reminder'), 'valueChange', true);
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'Permission Required',
      expect.any(String)
    ));
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(getByLabelText('Enable daily dream reminder').props.value).toBe(false);
    alertSpy.mockRestore();
  });

  it('toggling off cancels the reminder and persists the preference', async () => {
    mockSingle.mockResolvedValue({ data: { notification_reminders_enabled: true } });
    const notifications = new MockNotificationService();
    const cancelSpy = jest.spyOn(notifications, 'cancelReminder');
    const { getByLabelText } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByLabelText('Enable daily dream reminder').props.value).toBe(true));

    mockUpdateEq.mockClear();
    await act(async () => {
      fireEvent(getByLabelText('Enable daily dream reminder'), 'valueChange', false);
    });

    await waitFor(() => expect(cancelSpy).toHaveBeenCalledTimes(1));
    expect(mockUpdateEq).toHaveBeenCalled();
  });

  it('pressing the time label opens the picker, which is hidden by default', async () => {
    mockSingle.mockResolvedValue({ data: { notification_reminders_enabled: true } });
    const { getByText, UNSAFE_queryByProps } = render(
      <ServicesProvider services={buildRegistry(new MockNotificationService())}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Reminder Time')).toBeTruthy());

    expect(UNSAFE_queryByProps({ mode: 'time' })).toBeNull();

    fireEvent.press(getByText(/\d{1,2}:\d{2}/));

    expect(UNSAFE_queryByProps({ mode: 'time' })).toBeTruthy();
  });

  it('picker onChange with a date reschedules (when enabled) and persists the new time', async () => {
    mockSingle.mockResolvedValue({ data: { notification_reminders_enabled: true } });
    const notifications = new MockNotificationService();
    const scheduleSpy = jest.spyOn(notifications, 'scheduleReminder');
    const { getByText, UNSAFE_getByProps } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Reminder Time')).toBeTruthy());
    fireEvent.press(getByText(/\d{1,2}:\d{2}/));

    scheduleSpy.mockClear();
    mockUpdateEq.mockClear();
    const newDate = new Date();
    newDate.setHours(9, 15, 0, 0);

    await act(async () => {
      UNSAFE_getByProps({ mode: 'time' }).props.onChange(undefined, newDate);
    });

    await waitFor(() => expect(scheduleSpy).toHaveBeenCalledWith(9, 15));
    expect(mockUpdateEq).toHaveBeenCalled();
  });

  it('picker onChange with no date is a no-op (closes picker without rescheduling)', async () => {
    mockSingle.mockResolvedValue({ data: { notification_reminders_enabled: true } });
    const notifications = new MockNotificationService();
    const scheduleSpy = jest.spyOn(notifications, 'scheduleReminder');
    const { getByText, UNSAFE_getByProps, UNSAFE_queryByProps } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByText('Reminder Time')).toBeTruthy());
    fireEvent.press(getByText(/\d{1,2}:\d{2}/));

    scheduleSpy.mockClear();
    mockUpdateEq.mockClear();

    await act(async () => {
      UNSAFE_getByProps({ mode: 'time' }).props.onChange(undefined, undefined);
    });

    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(mockUpdateEq).not.toHaveBeenCalled();
    expect(UNSAFE_queryByProps({ mode: 'time' })).toBeNull();
  });

  it('picker onChange with a date while disabled persists without rescheduling (the `if (enabled)` false branch)', async () => {
    mockSingle.mockResolvedValue({ data: { notification_reminders_enabled: true } });
    const notifications = new MockNotificationService();
    const scheduleSpy = jest.spyOn(notifications, 'scheduleReminder');
    const { getByLabelText, getByText, UNSAFE_getByProps } = render(
      <ServicesProvider services={buildRegistry(notifications)}>
        <NotificationsScreen />
      </ServicesProvider>
    );
    await waitFor(() => expect(getByLabelText('Enable daily dream reminder').props.value).toBe(true));

    // Open the picker while enabled, then flip the switch off — showPicker is independent state,
    // so the picker stays mounted while `enabled` becomes false underneath it.
    fireEvent.press(getByText(/\d{1,2}:\d{2}/));
    await act(async () => {
      fireEvent(getByLabelText('Enable daily dream reminder'), 'valueChange', false);
    });
    expect(getByLabelText('Enable daily dream reminder').props.value).toBe(false);

    scheduleSpy.mockClear();
    mockUpdateEq.mockClear();
    const newDate = new Date();
    newDate.setHours(11, 45, 0, 0);

    await act(async () => {
      UNSAFE_getByProps({ mode: 'time' }).props.onChange(undefined, newDate);
    });

    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(mockUpdateEq).toHaveBeenCalled();
  });
});
