import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '@shared/components/Button';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';
import { ExpoLocalLockService } from '@services/auth/ExpoLocalLockService';

const lockService = new ExpoLocalLockService();

export default function OnboardingLockSetupScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    lockService.getLockMethod().then(method => {
      setBiometricAvailable(method === 'biometric');
    });
  }, []);

  const handleSetupPin = async () => {
    if (pin.length < 4) {
      Alert.alert('PIN Too Short', 'Please enter at least 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('PINs Do Not Match', 'Please make sure both PINs are the same.');
      return;
    }
    setLoading(true);
    try {
      await lockService.setupPin(pin);
      await AsyncStorage.setItem('onboarding_complete', 'true');
      router.replace('/(auth)/sign-in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Protect your dream journal</Text>
      <Text style={styles.subtitle}>
        {biometricAvailable
          ? 'Set a PIN as a backup to Face ID / Touch ID. Your journal is locked each time you leave the app.'
          : 'Create a PIN to protect your dream journal. Your journal is locked each time you leave the app.'}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Create PIN (min 4 digits)"
        placeholderTextColor="#6b6882"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        accessibilityLabel="Create PIN"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm PIN"
        placeholderTextColor="#6b6882"
        value={confirmPin}
        onChangeText={setConfirmPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        accessibilityLabel="Confirm PIN"
      />
      <Button label="Set Up Protection" onPress={handleSetupPin} disabled={loading || pin.length < 4} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: '#0d0d1a',
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#f0eeff',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: '#c8c0e8',
    lineHeight: 22,
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
