import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';

import { BrandSplash, SPLASH_FADE_MS } from '@shared/components/BrandSplash';
import en from '../../../src/i18n/locales/en.json';

/**
 * The launch screen is announced as a progressbar, which RTL's default query filter
 * keeps — but Nox hides herself from assistive technology, so she needs opting back in.
 */
const HIDDEN = { includeHiddenElements: true } as const;

/** Long enough to clear the minimum hold and the fade, whatever the floor is set to. */
const PAST_EVERYTHING = 5000;

function layout(el: { props: Record<string, unknown> }) {
  act(() => {
    (el.props['onLayout'] as () => void)();
  });
}

describe('BrandSplash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('draws the wordmark and the tagline the native icon cannot carry', () => {
    const { getByText } = render(<BrandSplash ready={false} onFinish={jest.fn()} />);

    expect(getByText(en.common.appName)).toBeTruthy();
    expect(getByText(en.splash.tagline)).toBeTruthy();
  });

  it('shows Nox at the same size as the native launch icon', () => {
    const { getByTestId } = render(<BrandSplash ready={false} onFinish={jest.fn()} />);

    // Matching `sizes.noxSplash` is what makes the native-to-drawn handover invisible.
    expect(getByTestId('splash-nox', HIDDEN)).toBeTruthy();
  });

  it('dismisses the native splash only once its replacement has been laid out', () => {
    const { getByTestId } = render(<BrandSplash ready={false} onFinish={jest.fn()} />);

    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

    const screen = getByTestId('brand-splash');
    layout(screen);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);

    // A re-layout (rotation, keyboard) must not fire it again.
    layout(screen);
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('stays up while the app behind it is still resolving its first route', () => {
    const onFinish = jest.fn();
    const { getByTestId } = render(<BrandSplash ready={false} onFinish={onFinish} />);
    layout(getByTestId('brand-splash'));

    act(() => {
      jest.advanceTimersByTime(PAST_EVERYTHING);
    });

    expect(onFinish).not.toHaveBeenCalled();
  });

  it('holds for the minimum beat once ready, then fades out', () => {
    const onFinish = jest.fn();
    const { getByTestId, rerender } = render(<BrandSplash ready={false} onFinish={onFinish} />);
    layout(getByTestId('brand-splash'));

    rerender(<BrandSplash ready onFinish={onFinish} />);

    // Ready is not a cue to disappear — the floor runs first, so a warm start does
    // not flash the launch screen.
    act(() => {
      jest.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onFinish).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(PAST_EVERYTHING);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
