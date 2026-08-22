import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@shared/components/Button';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';
import { useServices } from '@services/useServices';

export default function LockScreen() {
  const router = useRouter();
  const { localLock } = useServices();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void attemptBiometric();
  }, []);

  const attemptBiometric = async () => {
    const success = await localLock.authenticate('Unlock your dream journal');
    if (success) {
      router.replace('/(main)/journal');
    }
  };

  const handlePinSubmit = async () => {
    setError(null);
    const success = await localLock.verifyPin(pin);
    if (success) {
      router.replace('/(main)/journal');
    } else {
      setError('Incorrect PIN. Please try again.');
      setPin('');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🌙</Text>
      <Text style={styles.title}>Unlock Morpheo</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter PIN"
        placeholderTextColor="#6b6882"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        accessibilityLabel="Enter PIN"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label="Unlock"
        onPress={() => {
          void handlePinSubmit();
        }}
        disabled={pin.length < 4}
      />
      <TouchableOpacity
        onPress={() => {
          void attemptBiometric();
        }}
      >
        <Text style={styles.biometricLink}>Use Face ID / Touch ID</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(auth)/forgot-pin')}>
        <Text style={styles.forgotLink}>Forgot PIN?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: '#0d0d1a',
    gap: spacing.lg,
  },
  logo: { fontSize: 56 },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#f0eeff',
  },
  input: {
    width: '100%',
    backgroundColor: '#1a1a3e',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: '#f0eeff',
    borderWidth: 1,
    borderColor: '#3a3a6a',
    textAlign: 'center',
    letterSpacing: 8,
  },
  error: {
    color: '#f08080',
    fontSize: fontSize.sm,
  },
  biometricLink: {
    color: '#b399e0',
    fontSize: fontSize.md,
  },
  forgotLink: {
    color: '#6b6882',
    fontSize: fontSize.sm,
  },
});
