import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { TabBar } from '@shared/components/TabBar';

function buildProps(activeIndex = 0): BottomTabBarProps {
  const routes = [
    { key: 'journal-1', name: 'journal' },
    { key: 'insights-1', name: 'insights' },
    { key: 'log-1', name: 'log' },
    { key: 'settings-1', name: 'settings' },
  ];
  return {
    state: { index: activeIndex, routes },
    navigation: { navigate: jest.fn() },
    descriptors: {},
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;
}

describe('<TabBar />', () => {
  it('renders the tabs that have routes', () => {
    const { getByText } = render(<TabBar {...buildProps()} />);
    expect(getByText('Journal')).toBeTruthy();
    expect(getByText('Insights')).toBeTruthy();
    expect(getByText('Profile')).toBeTruthy();
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

  it('does not re-navigate to the tab already showing', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Journal tab'));

    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  it('routes the centre action to the log screen', () => {
    const props = buildProps(0);
    const { getByLabelText } = render(<TabBar {...props} />);

    fireEvent.press(getByLabelText('Log a new dream'));

    expect(props.navigation.navigate).toHaveBeenCalledWith('log');
  });

  it('every tab meets the 44px touch-target floor', () => {
    const { getByLabelText } = render(<TabBar {...buildProps()} />);
    for (const label of ['Journal tab', 'Insights tab', 'Profile tab']) {
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
