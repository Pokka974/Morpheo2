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
    const { getAllByText, getByText, getByRole } = render(<ExportScreen />);
    expect(getAllByText('Export My Data').length).toBeGreaterThan(0);
    expect(getByRole('button', { name: 'Export My Data' })).toBeTruthy();
    expect(getByText(/all your dreams and interpretations/i)).toBeTruthy();
  });

  it('on success, invokes export-data and shows the "Export Queued" success card', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: null });
    const { getByText, getByRole, queryByRole } = render(<ExportScreen />);

    fireEvent.press(getByRole('button', { name: 'Export My Data' }));

    await waitFor(() => expect(getByText('Export Queued')).toBeTruthy());
    expect(mockInvoke).toHaveBeenCalledWith('export-data');
    expect(queryByRole('button', { name: 'Export My Data' })).toBeNull();
  });

  it('on an error response, does not show the success card and the button reappears', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { getByRole, queryByText } = render(<ExportScreen />);

    fireEvent.press(getByRole('button', { name: 'Export My Data' }));

    await waitFor(() => expect(queryByText('Export Queued')).toBeNull());
    expect(getByRole('button', { name: 'Export My Data' })).toBeTruthy();
  });

  it('shows a spinner and disables the button while exporting is in flight', async () => {
    let resolveInvoke: (v: unknown) => void = () => {};
    mockInvoke.mockReturnValue(new Promise(resolve => { resolveInvoke = resolve; }));

    const { getByRole, queryByRole, UNSAFE_getByType } = render(<ExportScreen />);
    fireEvent.press(getByRole('button', { name: 'Export My Data' }));

    await waitFor(() => {
      expect(queryByRole('button', { name: 'Export My Data' })).toBeNull();
      expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
    });

    await act(async () => {
      resolveInvoke({ data: null, error: null });
      await Promise.resolve();
    });
  });
});
