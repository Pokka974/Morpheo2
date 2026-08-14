import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@shared/components/Button';
import { ErrorState } from '@shared/components/ErrorState';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';
import { useServices } from '@services/useServices';

export default function SignInScreen() {
  const router = useRouter();
  const { auth } = useServices();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.signInWithEmail(email, password);
      router.replace('/(main)/journal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.signInWithGoogle();
      router.replace('/(main)/journal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setError(null);
    setLoading(true);
    try {
      await auth.signInWithApple();
      router.replace('/(main)/journal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apple sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>Welcome back</Text>
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
        placeholder="Password"
        placeholderTextColor="#6b6882"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />
      <Button label={loading ? 'Signing in...' : 'Sign In'} onPress={handleSignIn} disabled={loading || !email || !password} />
      <Button label="Continue with Google" variant="secondary" onPress={handleGoogle} disabled={loading} />
      <Button label="Continue with Apple" variant="secondary" onPress={handleApple} disabled={loading} />
      <TouchableOpacity onPress={() => router.push('/(auth)/sign-up')}>
        <Text style={styles.link}>Don't have an account? Create one</Text>
      </TouchableOpacity>
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
  link: {
    color: '#b399e0',
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
