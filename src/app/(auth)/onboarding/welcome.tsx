import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@shared/components/Button';
import { colors, fontSize, spacing } from '@theme/tokens';

export default function OnboardingWelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌙</Text>
      <Text style={styles.title}>Morpheo</Text>
      <Text style={styles.tagline}>
        Unlock the meaning of your dreams through symbolic interpretation — not therapy.
      </Text>
      <Button label="Get Started" onPress={() => router.push('/(auth)/onboarding/consent')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  logo: {
    fontSize: 72,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
