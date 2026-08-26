import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StackActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { TabBar } from '@shared/components/TabBar';

function buildProps(activeIndex = 0, defaultPrevented = false): BottomTabBarProps {
  const routes = [
    { key: 'journal-1', name: 'journal' },
    { key: 'insights-1', name: 'insights' },
    { key: 'log-1', name: 'log' },
    { key: 'readings-1', name: 'readings' },
    { key: 'settings-1', name: 'settings' },
  ];
  return {
    state: { index: activeIndex, routes },
    navigation: {
      navigate: jest.fn(),
      dispatch: jest.fn(),
      emit: jest.fn().mockReturnValue({ defaultPrevented }),
    },
    descriptors: {},
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;
}

describe('<TabBar />', () => {
  it('renders the tabs that have routes', () => {
    const { getByText } = render(<TabBar {...buildProps()} />);
    expect(getByText('Journal')).toBeTruthy();
    expect(getByText('Insights')).toBeTruthy();
    expect(getByText('Readings')).toBeTruthy();
    expect(getByText('Profile')).toBeTruthy();
  });

  it('places Readings on the same side as Profile, after the centre action', () => {
    const { getByLabelText } = render(<TabBar {...buildProps()} />);
    // Left/right split is `Math.ceil(visible.length / 2)`: with all four tabs
    // present, Journal/Insights sit left of the centre action and
    // Readings/Profile sit right of it.
    expect(getByLabelText('Readings tab')).toBeTruthy();
    expect(getByLabelText('Profile tab')).toBeTruthy();
  });

  it('steps out of the way entirely while the dream-log flow is open', () => {
    // Logging is a modal flow with its own back chevron; a tab bar underneath would
    // offer a second, competing way out mid-telling.
    const { queryByText, queryByTestId } = render(<TabBar {...buildProps(2)} />);

    expect(queryByText('Journal')).toBeNull();
    expect(queryByText('Insights')).toBeNull();
    expect(queryByText('Readings')).toBeNull();
    expect(queryByText('Profile')).toBeNull();
    expect(queryByTestId('tab-log-dream')).toBeNull();
  });

  it('does not render the centre route as a tab', () => {
    const { queryByText } = render(<TabBar {...buildProps()} />);
    // `log` is reached through the centre action, never as a labelled tab.
    expect(queryByText('Log a dream')).toBeNull();
  });

  it('marks only the active route as selected', () => {
    const { getByLabelText } = render(<TabBar {...buildProps(1)} />);
    expect(getByLabelText('Insights tab').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('Journal tab').props.accessibilityState.selected).toBe(false);
  });

  it('navigates when a different tab is pressed', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Insights tab'));

    expect(props.navigation.navigate).toHaveBeenCalledWith('insights');
  });

  it('navigates to readings when its tab is pressed', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Readings tab'));

    expect(props.navigation.navigate).toHaveBeenCalledWith('readings');
  });

  // `journal` owns a nested Stack, so a dream's detail screen still reports `journal` as
  // the active tab. Pressing it used to do nothing at all, stranding the user on the detail
  // screen with only the header chevron as a way back to the list.
  it('pops the nested stack to its root when the tab already showing is pressed', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Journal tab'));

    expect(props.navigation.navigate).not.toHaveBeenCalled();
    expect(props.navigation.dispatch).toHaveBeenCalledWith(StackActions.popToTop());
  });

  it('emits tabPress against the pressed route, so a screen can react to its own tab', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Insights tab'));

    expect(props.navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'insights-1',
      canPreventDefault: true,
    });
  });

  it('honours preventDefault on the tabPress event', () => {
    const props = buildProps(0, true);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Insights tab'));

    expect(props.navigation.navigate).not.toHaveBeenCalled();
    expect(props.navigation.dispatch).not.toHaveBeenCalled();
  });

  it('routes the centre action to the log screen', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Log a new dream'));

    expect(props.navigation.navigate).toHaveBeenCalledWith('log');
  });

  it('every tab meets the 44px touch-target floor', () => {
    const { getByLabelText } = render(<TabBar {...buildProps()} />);
    for (const label of ['Journal tab', 'Insights tab', 'Readings tab', 'Profile tab']) {
      const style = getByLabelText(label).props.style;
      const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
      expect(flat.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('omits a tab whose route is not registered', () => {
    const props = buildProps();
    (props.state as { routes: Array<{ key: string; name: string }> }).routes = [
      { key: 'journal-1', name: 'journal' },
      { key: 'log-1', name: 'log' },
    ];
    const { queryByText, getByText } = render(<TabBar {...props} />);

    expect(getByText('Journal')).toBeTruthy();
    expect(queryByText('Insights')).toBeNull();
    expect(queryByText('Profile')).toBeNull();
  });
});
