import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

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

import StyleScreen from '@app/(main)/settings/style';

describe('StyleScreen', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSingle.mockReset().mockResolvedValue({ data: null });
    mockUpdateEq.mockReset().mockResolvedValue({});
  });

  it('defaults to Symbolic / Archetypal selected before load resolves / when no style is saved', async () => {
    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    expect(getByText('Symbolic / Archetypal').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontWeight: '600' })])
    );
  });

  it('reflects the loaded interpretation_style as selected', async () => {
    mockSingle.mockResolvedValue({ data: { interpretation_style: 'mythological' } });
    const { getByText } = render(<StyleScreen />);

    await waitFor(() => {
      const option = getByText('Mythological / Cultural');
      expect(option.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ fontWeight: '600' })])
      );
    });
  });

  it('with no authenticated user, stays at the default without crashing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { getByText } = render(<StyleScreen />);

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    expect(getByText('Interpretation Style')).toBeTruthy();
    expect(mockSingle).not.toHaveBeenCalled();
  });

  it('pressing an option optimistically selects it and persists to profiles', async () => {
    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    fireEvent.press(getByText('Psychological / Jungian'));

    await waitFor(() => expect(mockUpdateEq).toHaveBeenCalled());
    expect(getByText('Psychological / Jungian').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontWeight: '600' })])
    );
  });

  it('shows a "Saving..." row while the update is in flight', async () => {
    let resolveEq: (v: unknown) => void = () => {};
    mockUpdateEq.mockReturnValue(new Promise(resolve => { resolveEq = resolve; }));

    const { getByText, queryByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    fireEvent.press(getByText('Mythological / Cultural'));

    await waitFor(() => expect(queryByText('Saving...')).toBeTruthy());

    await act(async () => {
      resolveEq({});
      await Promise.resolve();
    });
  });

  it('handleSelect guards against a missing user: local selection updates but no write happens', async () => {
    const { getByText } = render(<StyleScreen />);
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());

    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    fireEvent.press(getByText('Mythological / Cultural'));

    await waitFor(() => {
      expect(getByText('Mythological / Cultural').props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ fontWeight: '600' })])
      );
    });
    expect(mockUpdateEq).not.toHaveBeenCalled();
  });
});
