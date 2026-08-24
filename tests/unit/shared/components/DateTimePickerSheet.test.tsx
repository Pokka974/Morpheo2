import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

import { DateTimePickerSheet } from '@shared/components/DateTimePickerSheet';

const VALUE = new Date('2026-08-22T22:00:00.000Z');

describe('<DateTimePickerSheet />', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('renders nothing when not visible', () => {
    const { toJSON } = render(
      <DateTimePickerSheet
        visible={false}
        mode="date"
        value={VALUE}
        title="Date"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(toJSON()).toBeNull();
  });

  describe('on Android', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it('commits immediately on a "set" event — the native dialog is already the confirmation step', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();
      const { getByTestId } = render(
        <DateTimePickerSheet
          visible
          mode="date"
          value={VALUE}
          title="Date"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      const picked = new Date('2026-08-25T00:00:00.000Z');
      act(() => {
        getByTestId('date-time-picker').props.onChange({ type: 'set' }, picked);
      });

      expect(onConfirm).toHaveBeenCalledWith(picked);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('cancels without committing on a "dismissed" event', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();
      const { getByTestId } = render(
        <DateTimePickerSheet
          visible
          mode="time"
          value={VALUE}
          title="Bedtime"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      act(() => {
        getByTestId('date-time-picker').props.onChange({ type: 'dismissed' }, undefined);
      });

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not wrap the native picker in its own modal sheet chrome', () => {
      Platform.OS = 'android';
      const { queryByText } = render(
        <DateTimePickerSheet
          visible
          mode="date"
          value={VALUE}
          title="Date"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      // No custom Cancel/Save bar — Android's own dialog provides that.
      expect(queryByText('Save')).toBeNull();
    });
  });

  describe('on iOS', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    it('does not commit while the value is still being scrolled — only on "Save"', () => {
      const onConfirm = jest.fn();
      const { getByTestId } = render(
        <DateTimePickerSheet
          visible
          mode="time"
          value={VALUE}
          title="Bedtime"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      );

      const inProgress = new Date('2026-08-22T23:15:00.000Z');
      act(() => {
        getByTestId('date-time-picker').props.onChange({ type: 'set' }, inProgress);
      });

      // This is exactly the bug report: on iOS the control fires onChange
      // continuously while scrolling, and closing on the first one meant it
      // "did not work at all" — the sheet must stay open and uncommitted.
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('commits the last scrolled value when "Save" is pressed', () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = render(
        <DateTimePickerSheet
          visible
          mode="time"
          value={VALUE}
          title="Bedtime"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      );

      const chosen = new Date('2026-08-22T23:15:00.000Z');
      act(() => {
        getByTestId('date-time-picker').props.onChange({ type: 'set' }, chosen);
      });
      fireEvent.press(getByText('Save'));

      expect(onConfirm).toHaveBeenCalledWith(chosen);
    });

    it('discards the in-progress value on "Cancel"', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();
      const { getByTestId, getByText } = render(
        <DateTimePickerSheet
          visible
          mode="date"
          value={VALUE}
          title="Date"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      );

      act(() => {
        getByTestId('date-time-picker').props.onChange(
          { type: 'set' },
          new Date('2026-08-25T00:00:00.000Z')
        );
      });
      fireEvent.press(getByText('Cancel'));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('renders the picker with a dark theme variant, so it never renders dark-on-dark against this app', () => {
      const { getByTestId } = render(
        <DateTimePickerSheet
          visible
          mode="date"
          value={VALUE}
          title="Date"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      );
      expect(getByTestId('date-time-picker').props.themeVariant).toBe('dark');
    });

    it('resets the draft to the incoming value each time the sheet reopens', () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText, rerender } = render(
        <DateTimePickerSheet
          visible
          mode="time"
          value={VALUE}
          title="Bedtime"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      );

      // Scroll to a value, then close without saving.
      act(() => {
        getByTestId('date-time-picker').props.onChange(
          { type: 'set' },
          new Date('2026-08-22T23:15:00.000Z')
        );
      });
      rerender(
        <DateTimePickerSheet
          visible={false}
          mode="time"
          value={VALUE}
          title="Bedtime"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      );
      rerender(
        <DateTimePickerSheet
          visible
          mode="time"
          value={VALUE}
          title="Bedtime"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      );

      fireEvent.press(getByText('Save'));
      expect(onConfirm).toHaveBeenCalledWith(VALUE);
    });
  });
});
