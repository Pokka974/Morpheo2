import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSegments: () => [],
}));

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'test-id', email: 'test@test.com' } } }) },
    from: jest.fn().mockReturnValue({ update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({}) }), insert: jest.fn().mockResolvedValue({}) }),
  },
}));

import OnboardingWelcomeScreen from '@app/(auth)/onboarding/welcome';
import OnboardingConsentScreen from '@app/(auth)/onboarding/consent';

const mockLockService = new MockLocalLockService();

describe('Onboarding Flow', () => {
  it('welcome screen renders value prop and Get Started button', () => {
    const { getByText } = render(<OnboardingWelcomeScreen />);
    expect(getByText('Get Started')).toBeTruthy();
    expect(getByText('Morpheo')).toBeTruthy();
  });

  it('consent screen contains AI provider category mention', () => {
    const { getByText } = render(<OnboardingConsentScreen />);
    expect(getByText(/AI provider/i)).toBeTruthy();
  });

  it('consent screen blocks with modal on No Thanks', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    const { getByText } = render(<OnboardingConsentScreen />);
    const noThanksBtn = getByText('No Thanks');
    fireEvent.press(noThanksBtn);
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Consent Required/i),
        expect.any(String),
        expect.any(Array)
      );
    });
    alertSpy.mockRestore();
  });

  it('mock lock service not configured initially', async () => {
    const notConfigured = new MockLocalLockService();
    notConfigured.configure('not_configured');
    expect(await notConfigured.isConfigured()).toBe(false);
  });

  it('lock service reports configured after setup', async () => {
    expect(await mockLockService.isConfigured()).toBe(true);
  });
});
