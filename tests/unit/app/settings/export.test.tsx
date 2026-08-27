import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockInvoke = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

import ExportScreen from '@app/(main)/settings/export';

describe('ExportScreen', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('renders the title and description copy', () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    const { getAllByText, getByRole } = render(<ExportScreen />);
    expect(getAllByText('Export my data').length).toBeGreaterThan(0);
    expect(getByRole('button', { name: 'Export my data' })).toBeTruthy();
    expect(getAllByText(/all your dreams and interpretations/i).length).toBeGreaterThan(0);
  });

  it('on success, invokes export-data and shows the "Export queued" success card', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    const { getByText, getByRole, queryByRole } = render(<ExportScreen />);

    fireEvent.press(getByRole('button', { name: 'Export my data' }));

    await waitFor(() => expect(getByText('Export queued')).toBeTruthy());
    expect(mockInvoke).toHaveBeenCalledWith('export-data');
    // The button is replaced by the success card once the export is queued.
    expect(queryByRole('button', { name: 'Export my data' })).toBeNull();
  });

  it('on an error response, does not show the success card and the button stays usable', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { getByRole, queryByText } = render(<ExportScreen />);

    fireEvent.press(getByRole('button', { name: 'Export my data' }));

    await waitFor(() => expect(queryByText('Export queued')).toBeNull());
    const button = getByRole('button', { name: 'Export my data' });
    expect(button).toBeTruthy();
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('shows a spinner and marks the button busy/disabled while exporting is in flight', async () => {
    let resolveInvoke: (v: unknown) => void = () => {};
    mockInvoke.mockReturnValue(
      new Promise(resolve => {
        resolveInvoke = resolve;
      })
    );

    const { getByRole, UNSAFE_getByType } = render(<ExportScreen />);
    const button = getByRole('button', { name: 'Export my data' });
    fireEvent.press(button);

    await waitFor(() => {
      expect(button.props.accessibilityState?.busy).toBe(true);
      expect(button.props.accessibilityState?.disabled).toBe(true);
      expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
    });

    await act(async () => {
      resolveInvoke({ data: null, error: null });
      await Promise.resolve();
    });
  });
});
