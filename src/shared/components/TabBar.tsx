import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StackActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { ActionButton } from '@shared/components/Button';
import { colors, MIN_TOUCH_TARGET, sizes, spacing, typography } from '@theme/tokens';

/**
 * The design's tab bar: labelled icon tabs either side of a raised centre action.
 *
 * Icons are stroked SVG on a 24px grid rather than glyphs or emoji, so they inherit
 * the palette and scale cleanly. Every tab meets the 44px touch-target floor even
 * though its visible icon is smaller.
 *
 * Four tabs either side of the centre action: Journal · Insights · Readings ·
 * Profile.
 */

type IconProps = { active: boolean };

const stroke = (active: boolean) => (active ? colors.accentText : colors.textMuted);
const strokeWidth = (active: boolean) => (active ? 1.8 : 1.6);

function JournalIcon({ active }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3.5}
        y={4.5}
        width={17}
        height={15}
        rx={2.5}
        stroke={stroke(active)}
        strokeWidth={strokeWidth(active)}
      />
      <Line
        x1={12}
        y1={4.5}
        x2={12}
        y2={19.5}
        stroke={stroke(active)}
        strokeWidth={strokeWidth(active)}
      />
    </Svg>
  );
}

function InsightsIcon({ active }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={stroke(active)} strokeWidth={strokeWidth(active)} />
      <Circle cx={12} cy={12} r={3} stroke={stroke(active)} strokeWidth={strokeWidth(active)} />
    </Svg>
  );
}

/** The Lecture(s) tab — a rotated square, the same 24px stroke grid as its siblings. */
function ReadingsIcon({ active }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4.5}
        y={4.5}
        width={13}
        height={13}
        rx={2}
        transform="rotate(45 11 11)"
        stroke={stroke(active)}
        strokeWidth={strokeWidth(active)}
      />
    </Svg>
  );
}

function ProfileIcon({ active }: IconProps) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={3.5} stroke={stroke(active)} strokeWidth={strokeWidth(active)} />
      <Path
        d="M5.5 19.5a6.5 6.5 0 0 1 13 0"
        stroke={stroke(active)}
        strokeWidth={strokeWidth(active)}
      />
    </Svg>
  );
}

const ICONS: Record<string, React.ComponentType<IconProps>> = {
  journal: JournalIcon,
  insights: InsightsIcon,
  readings: ReadingsIcon,
  settings: ProfileIcon,
};

const LABEL_KEYS: Record<string, string> = {
  journal: 'tabs.journal',
  insights: 'tabs.insights',
  readings: 'tabs.readings',
  settings: 'tabs.profile',
};

/** Routes shown as tabs, in bar order. `log` is the centre action, not a tab. */
const TAB_ORDER = ['journal', 'insights', 'readings', 'settings'] as const;
const CENTRE_ROUTE = 'log';

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const visible = TAB_ORDER.filter(name => state.routes.some(r => r.name === name));
  // Split the tabs either side of the centre action.
  const half = Math.ceil(visible.length / 2);
  const left = visible.slice(0, half);
  const right = visible.slice(half);

  const activeName = state.routes[state.index]?.name;

  // Logging a dream is a modal flow, not a destination: it opens from the centre
  // action and is left through its own back chevron, so the bar steps out of the way
  // rather than offering a second, competing way out mid-telling.
  if (activeName === CENTRE_ROUTE) return null;

  /**
   * A tab press has to do something even when its tab is already selected.
   *
   * `journal` owns a nested Stack, so standing on a dream's detail screen still reports
   * `journal` as the active tab — the old `if (!active) navigate(...)` guard therefore made
   * the press a silent no-op, stranding the user on the detail screen with no way back to
   * the list except the header chevron. Pressing the active tab now returns it to its root,
   * which is what every other tabbed app does.
   *
   * The `tabPress` event is emitted either way, and before the navigation, so a screen can
   * react to its own tab being pressed — the journal list uses it to scroll back to the top.
   * Emitting it also restores the standard React Navigation contract that a custom tab bar
   * is expected to honour, including `preventDefault()`.
   */
  const handleTabPress = (name: string, active: boolean) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (event.defaultPrevented) return;

    if (active) {
      // Unhandled by the tab navigator itself, so it bubbles to the focused nested
      // stack. A no-op when that stack is already at its root.
      navigation.dispatch(StackActions.popToTop());
    } else {
      navigation.navigate(name);
    }
  };

  const renderTab = (name: string) => {
    const Icon = ICONS[name];
    if (!Icon) return null;
    const active = activeName === name;
    const label = t(LABEL_KEYS[name] ?? name);

    return (
      <Pressable
        key={name}
        onPress={() => handleTabPress(name, active)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t('a11y.tab', { label })}
        style={styles.tab}
      >
        <Icon active={active} />
        <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.side}>{left.map(renderTab)}</View>

      <ActionButton
        onPress={() => navigation.navigate(CENTRE_ROUTE)}
        accessibilityLabel={t('a11y.logDreamButton')}
        testID="tab-log-dream"
      />

      <View style={styles.side}>
        {right.map(renderTab)}
        {/* Keeps the centre action optically centred while "Readings" has no route. */}
        {right.length < left.length ? <View style={styles.tab} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingHorizontal: 22,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tab: {
    width: sizes.tabItem,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  label: {
    ...typography.tabLabel,
  },
  labelActive: {
    color: colors.accentText,
  },
  labelIdle: {
    color: colors.textMuted,
  },
});
