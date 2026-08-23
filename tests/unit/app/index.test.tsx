import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

import Root from '@app/index';

describe('Root index screen', () => {
  it('redirects to the auth welcome route', () => {
    render(<Root />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(auth)/onboarding/welcome' });
  });

  // Regression guard: this href previously pointed at a route that didn't exist
  // (welcome.tsx lives under onboarding/, not directly under (auth)/), which Expo
  // Router only surfaces at runtime as "Unmatched Route" — this mock-based test
  // couldn't have caught the mismatch on its own.
  it('the redirect target corresponds to a real route file', () => {
    mockRedirect.mockClear();
    render(<Root />);
    const target = mockRedirect.mock.calls[0]?.[0]?.href.replace(/^\//, '');
    const routeFile = path.join(__dirname, '../../../src/app', `${target}.tsx`);
    expect(fs.existsSync(routeFile)).toBe(true);
  });
});
