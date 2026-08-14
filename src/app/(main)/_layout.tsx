import { Tabs } from 'expo-router';

export default function MainLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="log" options={{ title: 'Log Dream' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />

      {/* Non-tab screens — hidden from tab bar */}
      <Tabs.Screen name="paywall" options={{ href: null }} />
    </Tabs>
  );
}
