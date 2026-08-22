import React from 'react';
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

import Root from '@app/index';

describe('Root index screen', () => {
  it('redirects to the auth welcome route', () => {
    render(<Root />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(auth)/welcome' });
  });
});
