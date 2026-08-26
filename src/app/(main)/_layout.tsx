import React from 'react';
import { Tabs } from 'expo-router';

import { TabBar } from '@shared/components/TabBar';
import { colors } from '@theme/tokens';

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
      tabBar={props => <TabBar {...props} />}
    >
      <Tabs.Screen name="journal" />
      <Tabs.Screen name="insights" />
      {/* Reached through the tab bar's centre action, not rendered as a tab. */}
      <Tabs.Screen name="log" />
      <Tabs.Screen name="readings" />
      <Tabs.Screen name="settings" />

      {/* Non-tab screens — hidden from the bar */}
      <Tabs.Screen name="paywall" options={{ href: null }} />
    </Tabs>
  );
}
