import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@shared/components/Button';
import { supabase } from '@services/../supabase/client';
import { colors, fontSize, spacing } from '@theme/tokens';

export default function OnboardingConsentScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleAgree = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ ai_consent_granted: true, ai_consent_granted_at: new Date().toISOString() })
          .eq('id', user.id);

        if (updateError) {
          console.error('Consent update failed:', updateError);
          Alert.alert('Error', 'Could not save your consent. Please try again or contact support.');
          return;
        }

        await supabase.from('consent_records').insert({ user_id: user.id, action: 'granted' });
      }
      router.push('/(auth)/onboarding/lock-setup');
    } catch (e) {
      console.error('Consent screen error:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNoThanks = () => {
    Alert.alert(
      'Consent Required',
      'Morpheo needs your consent to send dream descriptions to an AI provider for interpretation. Without this, the app cannot analyze your dreams.\n\nYour dreams are processed securely and are never used to train AI models.',
      [{ text: 'OK', style: 'default' }]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>A quick note about privacy</Text>
      <View style={styles.card}>
        <Text style={styles.bodyText}>
          To interpret your dreams, Morpheo sends your dream description to Anthropic (Claude). To
          illustrate them, it sends a short visual description of the dream to Black Forest Labs
          (FLUX).
        </Text>
        <Text style={styles.bodyText}>
          • Your dream text is sent securely and encrypted in transit.
        </Text>
        <Text style={styles.bodyText}>
          • Your dreams are <Text style={styles.bold}>never used to train AI models</Text>.
        </Text>
        <Text style={styles.bodyText}>
          • Interpretations are symbolic and cultural — not clinical or therapeutic advice.
        </Text>
        <Text style={styles.bodyText}>• You can revoke consent at any time in Settings.</Text>
      </View>
      <Button
        label="I Agree"
        onPress={() => {
          void handleAgree();
        }}
        disabled={loading}
      />
      <Button label="No Thanks" variant="ghost" onPress={handleNoThanks} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.inputSurface,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.md,
  },
  bodyText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: colors.accentText,
  },
});
