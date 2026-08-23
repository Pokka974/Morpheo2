import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@shared/components/Button';
import { supabase } from '../../supabase/client';
import { useServices } from '@services/useServices';
import { colors, fontSize, spacing } from '@theme/tokens';

export default function ForgotPinScreen() {
  const router = useRouter();
  const { localLock: lockService } = useServices();
  const [password, setPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [loading, setLoading] = useState(false);

  const handleVerifyPassword = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No email');
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (error) throw error;
      setStep('reset');
    } catch {
      Alert.alert('Verification Failed', 'Incorrect password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (newPin !== confirmPin) {
      Alert.alert('PINs Do Not Match', 'Please make sure both PINs are the same.');
      return;
    }
    setLoading(true);
    try {
      await lockService.setupPin(newPin);
      Alert.alert('PIN Updated', 'Your PIN has been reset successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {step === 'verify' ? (
        <>
          <Text style={styles.title}>Verify your identity</Text>
          <Text style={styles.subtitle}>Enter your account password to reset your PIN.</Text>
          <TextInput
            style={styles.input}
            placeholder="Account password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            label="Verify"
            onPress={() => {
              void handleVerifyPassword();
            }}
            disabled={loading || !password}
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>Set new PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="New PIN (min 4 digits)"
            placeholderTextColor={colors.textMuted}
            value={newPin}
            onChangeText={setNewPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new PIN"
            placeholderTextColor={colors.textMuted}
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
          />
          <Button
            label="Reset PIN"
            onPress={() => {
              void handleResetPin();
            }}
            disabled={loading || newPin.length < 4}
          />
        </>
      )}
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
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.inputSurface,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderElevated,
  },
});
