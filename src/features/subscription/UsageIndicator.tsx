import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useServices } from '@services/useServices';
import type { Entitlement } from '@services/entitlement/EntitlementService';
import { colors, spacing } from '@theme/tokens';

export function UsageIndicator() {
  const { entitlement } = useServices();
  const [data, setData] = useState<Entitlement | null>(null);

  useEffect(() => {
    entitlement
      .fetchEntitlement()
      .then(setData)
      .catch((err: unknown) => {
        // Non-blocking: the indicator stays hidden rather than breaking the screen.
        console.error('Failed to load usage entitlement:', err);
      });
  }, [entitlement]);

  if (!data || data.subscriptionTier === 'premium') return null;

  const limit = data.monthlyInterpretationLimit ?? 5;
  const used = data.interpretationsUsedThisMonth;
  const resetMonth = data.resetDate.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Text style={styles.text}>
        {used} of {limit} interpretations used · resets {resetMonth}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  text: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
