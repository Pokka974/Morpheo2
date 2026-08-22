import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@shared/components/Button';
import { ErrorState } from '@shared/components/ErrorState';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';
import { useServices } from '@services/useServices';

export default function SignUpScreen() {
  const router = useRouter();
  const { auth } = useServices();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await auth.signUp(email, password);
      router.replace('/(main)/journal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Create your account</Text>
      {error ? <ErrorState message={error} /> : null}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#6b6882"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 8 characters)"
        placeholderTextColor="#6b6882"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        placeholderTextColor="#6b6882"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <Button
        label={loading ? 'Creating account...' : 'Create Account'}
        onPress={() => {
          void handleSignUp();
        }}
        disabled={loading || !email || !password || !confirmPassword}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: '#0d0d1a',
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#f0eeff',
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: '#1a1a3e',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: '#f0eeff',
    borderWidth: 1,
    borderColor: '#3a3a6a',
  },
});
