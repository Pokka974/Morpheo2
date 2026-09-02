import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { Nox } from '@shared/components/Nox';
import { sizes } from '@theme/tokens';

/**
 * Nox is decorative, so she hides herself from assistive technology — which is
 * exactly what RTL's default query filter drops. Every lookup here opts back in.
 */
const HIDDEN = { includeHiddenElements: true } as const;

/** Lets the reduce-motion query settle before assertions, so nothing updates late. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function styleOf(el: { props: Record<string, unknown> }) {
  return StyleSheet.flatten(el.props.style) as {
    width: number;
    height: number;
    transform: ({ scale?: number } | { rotate?: string })[];
  };
}

describe('Nox', () => {
  it('renders at the wait-screen size by default', async () => {
    const { getByTestId } = render(<Nox testID="nox" />);
    await flush();

    const style = styleOf(getByTestId('nox', HIDDEN));
    expect(style.width).toBe(sizes.nox);
    expect(style.height).toBe(sizes.nox);
  });

  it('honours an explicit size', async () => {
    const { getByTestId } = render(<Nox testID="nox" size={48} />);
    await flush();

    const style = styleOf(getByTestId('nox', HIDDEN));
    expect(style.width).toBe(48);
    expect(style.height).toBe(48);
  });

  it('never mirrors her — the sway is rotation only, and no axis is scaled negatively', async () => {
    const { getByTestId } = render(<Nox testID="nox" />);
    await flush();

    // The design system's hard rule: Nox always looks to the left. A negative scale
    // on either axis, or a `scaleX`/`scaleY` entry at all, would flip her.
    for (const entry of styleOf(getByTestId('nox', HIDDEN)).transform) {
      expect(entry).not.toHaveProperty('scaleX');
      expect(entry).not.toHaveProperty('scaleY');
      if ('scale' in entry && entry.scale !== undefined) expect(entry.scale).toBeGreaterThan(0);
    }
  });

  it('stays out of the accessibility tree — the screen around her names the wait', async () => {
    const { getByTestId } = render(<Nox testID="nox" />);
    await flush();

    const el = getByTestId('nox', HIDDEN);
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('drops its reduce-motion listener on unmount rather than leaking it', async () => {
    const remove = jest.fn();
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >);

    const { unmount } = render(<Nox testID="nox" />);
    await flush();
    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('survives a reduce-motion query that rejects, rather than losing the mascot', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockRejectedValue(new Error('no accessibility manager'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByTestId } = render(<Nox testID="nox" />);
    await flush();

    expect(getByTestId('nox', HIDDEN)).toBeTruthy();
  });
});
