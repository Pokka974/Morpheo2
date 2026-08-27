import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { colors } from '@theme/tokens';

type QueryResult = ReturnType<ReturnType<typeof render>['getByText']>;

const mockGetUser = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpdateEq = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })) })),
      update: jest.fn(() => ({ eq: mockUpdateEq })),
    })),
  },
}));

import StyleScreen from '@app/(main)/settings/style';

/** The selected option is the only one styled in the primary text colour. */
function expectSelected(node: QueryResult) {
  expect(node.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: colors.textPrimary })])
  );
}

describe('StyleScreen', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    mockUpdateEq.mockReset().mockResolvedValue({ error: null });
  });

  it('defaults to Symbolic / Archetypal selected before load resolves / when no style is saved', async () => {
    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    expectSelected(getByText('Symbolic / Archetypal'));
  });

  it('reflects the loaded interpretation_style as selected', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { interpretation_style: 'mythological' },
      error: null,
    });
    const { getByText } = render(<StyleScreen />);

    await waitFor(() => expectSelected(getByText('Mythological / Cultural')));
  });

  it('with no authenticated user, stays at the default without crashing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { getByText } = render(<StyleScreen />);

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(getByText('Interpretation style')).toBeTruthy();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('logs and continues when the style query errors', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockMaybeSingle).toHaveBeenCalled());

    // Falls back to the default selection rather than crashing.
    expectSelected(getByText('Symbolic / Archetypal'));
    expect(errorSpy).toHaveBeenCalledWith('Failed to load interpretation style:', {
      message: 'boom',
    });
    errorSpy.mockRestore();
  });

  it('pressing an option optimistically selects it and persists to profiles', async () => {
    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    fireEvent.press(getByText('Psychological / Jungian'));

    await waitFor(() => expect(mockUpdateEq).toHaveBeenCalled());
    expectSelected(getByText('Psychological / Jungian'));
  });

  it('shows a "Saving…" row while the update is in flight', async () => {
    let resolveEq: (v: unknown) => void = () => {};
    mockUpdateEq.mockReturnValue(
      new Promise(resolve => {
        resolveEq = resolve;
      })
    );

    const { getByText, queryByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    fireEvent.press(getByText('Mythological / Cultural'));

    await waitFor(() => expect(queryByText('Saving…')).toBeTruthy());

    await act(async () => {
      resolveEq({ error: null });
      await Promise.resolve();
    });
  });

  it('handleSelect guards against a missing user: local selection updates but no write happens', async () => {
    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    fireEvent.press(getByText('Mythological / Cultural'));

    await waitFor(() => expectSelected(getByText('Mythological / Cultural')));
    expect(mockUpdateEq).not.toHaveBeenCalled();
  });
});
