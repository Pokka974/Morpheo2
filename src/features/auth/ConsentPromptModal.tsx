import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from '@shared/components/Button';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';
import { supabase } from '../../supabase/client';

interface Props {
  visible: boolean;
  onGranted: () => void;
  onDismiss: () => void;
}

export function ConsentPromptModal({ visible, onGranted, onDismiss }: Props) {
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({
            ai_consent_granted: true,
            ai_consent_granted_at: new Date().toISOString(),
          })
          .eq('id', user.id);
        await supabase.from('consent_records').insert({ user_id: user.id, action: 'granted' });
      }
      onGranted();
    } catch {
      onGranted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Enable AI Interpretation</Text>
          <Text style={styles.body}>
            To interpret your dreams, Morpheo sends your dream text to Anthropic Claude (an AI
            provider). Your dreams are never used to train AI models. Interpretations are symbolic,
            not clinical advice.
          </Text>
          <Button
            label={loading ? 'Granting...' : 'Grant Consent'}
            onPress={() => {
              void handleGrant();
            }}
            disabled={loading}
          />
          <Button label="Not Now" variant="ghost" onPress={onDismiss} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: '#1a1a3e',
    borderRadius: 16,
    padding: spacing.xl,
    gap: spacing.lg,
    width: '100%',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: '#f0eeff',
  },
  body: {
    fontSize: fontSize.md,
    color: '#c8c0e8',
    lineHeight: 22,
  },
});
