import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { JournalFilterSheet, periodStartDate } from '@features/journal/JournalFilterSheet';

describe('periodStartDate', () => {
  it('returns no bound for "all", so the query stays unfiltered by date', () => {
    expect(periodStartDate('all')).toBeUndefined();
  });

  it('subtracts the window in whole days and formats it date-only', () => {
    expect(periodStartDate('30', new Date(2026, 7, 26))).toBe('2026-07-27');
    expect(periodStartDate('90', new Date(2026, 7, 26))).toBe('2026-05-28');
  });

  it('zero-pads month and day so the string compares correctly against occurred_at', () => {
    expect(periodStartDate('30', new Date(2026, 1, 5))).toBe('2026-01-06');
  });

  it('crosses a year boundary correctly', () => {
    expect(periodStartDate('30', new Date(2026, 0, 10))).toBe('2025-12-11');
  });

  /**
   * The guard that matters: `dreams.occurred_at` is a local date-only string, so the
   * bound must be built from local getters. Going through toISOString() would shift
   * the boundary by the UTC offset and drop or add a night at the edge of the window.
   */
  it('uses local calendar fields, not UTC', () => {
    // Late evening local time — in any timezone east of UTC this is already the next
    // UTC day, so a toISOString()-based implementation would return a day later.
    const lateEvening = new Date(2026, 7, 26, 23, 30);
    const expectedDay = new Date(2026, 7, 26 - 30).getDate();
    expect(periodStartDate('30', lateEvening)?.slice(8)).toBe(`${expectedDay}`.padStart(2, '0'));
  });
});

describe('JournalFilterSheet', () => {
  function renderSheet(overrides: Partial<React.ComponentProps<typeof JournalFilterSheet>> = {}) {
    const props = {
      visible: true,
      filters: {},
      period: 'all' as const,
      onApply: jest.fn(),
      onClear: jest.fn(),
      onCancel: jest.fn(),
      ...overrides,
    };
    return { ...render(<JournalFilterSheet {...props} />), props };
  }

  it('renders nothing while closed', () => {
    const { queryByTestId } = renderSheet({ visible: false });
    expect(queryByTestId('journal-filter-apply')).toBeNull();
  });

  it('offers every emotion up front, with no "+ N" reveal', () => {
    const { getByText, queryByText } = renderSheet();
    expect(getByText('fear')).toBeTruthy();
    expect(getByText('wonder')).toBeTruthy();
    expect(queryByText(/^\+ /)).toBeNull();
  });

  it('does not touch the list until Apply — a half-made selection stays a draft', () => {
    const onApply = jest.fn();
    const { getByText } = renderSheet({ onApply });

    fireEvent.press(getByText('fear'));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('keeps one emotion at a time, since the query takes a single emotion', () => {
    const onApply = jest.fn();
    const { getByText, getByTestId } = renderSheet({ onApply });

    fireEvent.press(getByText('fear'));
    fireEvent.press(getByText('joy'));
    fireEvent.press(getByTestId('journal-filter-apply'));

    expect(onApply).toHaveBeenCalledWith({ emotion: 'joy', startDate: undefined }, 'all');
  });

  it('deselects an emotion when it is pressed again', () => {
    const onApply = jest.fn();
    const { getByText, getByTestId } = renderSheet({ onApply });

    fireEvent.press(getByText('fear'));
    fireEvent.press(getByText('fear'));
    fireEvent.press(getByTestId('journal-filter-apply'));

    expect(onApply).toHaveBeenCalledWith({ emotion: undefined, startDate: undefined }, 'all');
  });

  it('reopens showing the filters already in force rather than a blank slate', () => {
    const onApply = jest.fn();
    const filters = { emotion: 'anger', startDate: periodStartDate('90') };
    const { getByTestId } = renderSheet({ filters, period: '90', onApply });

    // Applying without touching anything must reproduce the same filters.
    fireEvent.press(getByTestId('journal-filter-apply'));
    expect(onApply).toHaveBeenCalledWith(filters, '90');
  });

  /**
   * The period is carried, not re-derived from `filters.startDate` — that bound is
   * relative to "now", so a sheet reopened after midnight would otherwise fall back to
   * "All" while a 30-day filter was still in force.
   */
  it('reopens on the applied period even when its start date no longer matches today', () => {
    const onApply = jest.fn();
    const { getByTestId } = renderSheet({
      filters: { startDate: '2020-01-01' },
      period: '30',
      onApply,
    });

    fireEvent.press(getByTestId('journal-filter-apply'));
    expect(onApply).toHaveBeenCalledWith(
      { emotion: undefined, startDate: periodStartDate('30') },
      '30'
    );
  });

  it('disables Clear when there is nothing to clear', () => {
    const onClear = jest.fn();
    const { getByTestId } = renderSheet({ onClear });

    fireEvent.press(getByTestId('journal-filter-clear'));
    expect(onClear).not.toHaveBeenCalled();
  });

  it('enables Clear once a filter is in force', () => {
    const onClear = jest.fn();
    const { getByTestId } = renderSheet({ filters: { emotion: 'fear' }, onClear });

    fireEvent.press(getByTestId('journal-filter-clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('dismisses through the scrim without applying anything', () => {
    const onCancel = jest.fn();
    const onApply = jest.fn();
    const { getByLabelText } = renderSheet({ onCancel, onApply });

    fireEvent.press(getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('marks the selected emotion as a radio, not a checkbox', () => {
    const { getAllByLabelText } = renderSheet({ filters: { emotion: 'fear' } });
    const [chip] = getAllByLabelText(/fear/);
    expect(chip.props.accessibilityRole).toBe('radio');
    expect(chip.props.accessibilityState.selected).toBe(true);
  });
});
