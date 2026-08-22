import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => {
  const StackComponent = ({ children }: { children?: React.ReactNode }) => <>{children ?? null}</>;
  (StackComponent as any).Screen = () => null;
  const TabsComponent = ({ children }: { children?: React.ReactNode }) => <>{children ?? null}</>;
  (TabsComponent as any).Screen = () => null;
  return { Stack: StackComponent, Tabs: TabsComponent };
});

import AuthLayout from '@app/(auth)/_layout';
import MainLayout from '@app/(main)/_layout';
import InsightsLayout from '@app/(main)/insights/_layout';
import JournalLayout from '@app/(main)/journal/_layout';
import LogLayout from '@app/(main)/log/_layout';
import SettingsLayout from '@app/(main)/settings/_layout';

describe('Route layouts', () => {
  it('renders the (auth) stack layout without throwing', () => {
    expect(() => render(<AuthLayout />)).not.toThrow();
  });

  it('renders the (main) tab layout without throwing', () => {
    expect(() => render(<MainLayout />)).not.toThrow();
  });

  it('renders the insights stack layout without throwing', () => {
    expect(() => render(<InsightsLayout />)).not.toThrow();
  });

  it('renders the journal stack layout without throwing', () => {
    expect(() => render(<JournalLayout />)).not.toThrow();
  });

  it('renders the log stack layout without throwing', () => {
    expect(() => render(<LogLayout />)).not.toThrow();
  });

  it('renders the settings stack layout without throwing', () => {
    expect(() => render(<SettingsLayout />)).not.toThrow();
  });
});
