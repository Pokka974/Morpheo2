import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from '@shared/components/Button';
import { spacing } from '@shared/tokens/spacing';
import { fontSize } from '@shared/tokens/typography';
import { saveDream, validateForInterpretation } from '@features/dream-log/dreamRepository';
import { syncPendingDreams } from '@features/dream-log/syncService';
import { useServices } from '@services/useServices';

const MIN_DESCRIPTION = 20;

function generateId(): string {
  // dreams.id is a Postgres uuid column — must be a valid UUID, not a local-only string.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function DreamLogScreen() {
  const router = useRouter();
  const { auth } = useServices();
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startVoice = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Voice = require('@react-native-voice/voice').default;
      Voice.onSpeechResults = (e: { value?: string[] }) => {
        if (e.value?.[0]) {
          setDescription(prev => (prev ? prev + ' ' + e.value![0] : e.value![0]!));
        }
      };
      await Voice.start('en-US');
      setIsListening(true);
    } catch {
      setError('Voice dictation is not available on this device.');
    }
  };

  const stopVoice = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Voice = require('@react-native-voice/voice').default;
      await Voice.stop();
      setIsListening(false);
    } catch {
      setIsListening(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const session = await auth.getSession();
      if (!session) {
        router.replace('/(auth)/sign-in');
        return;
      }
      await saveDream({
        id: generateId(),
        userId: session.user.id,
        description: description.trim(),
        occurredAt: occurredAt.toISOString().slice(0, 10),
      });
      setDescription('');
      // Best-effort immediate sync so the dream exists server-side before the
      // user requests an interpretation (interpretations.dream_id has an FK
      // to dreams.id). Offline saves still queue via useSyncOnConnect.
      syncPendingDreams().catch(() => {});
      router.navigate('/(main)/journal');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save dream.');
    } finally {
      setSaving(false);
    }
  };

  const maxDate = new Date();
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 1);

  const canInterpret = description.trim().length >= MIN_DESCRIPTION;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Log a Dream</Text>

        <TouchableOpacity style={styles.dateRow} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateLabel}>
            Dream occurred: <Text style={styles.dateValue}>{occurredAt.toLocaleDateString()}</Text>
          </Text>
        </TouchableOpacity>

        {showDatePicker ? (
          <DateTimePicker
            value={occurredAt}
            mode="date"
            maximumDate={maxDate}
            minimumDate={minDate}
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setOccurredAt(date);
            }}
          />
        ) : null}

        <View style={styles.textAreaContainer}>
          <TextInput
            style={styles.textArea}
            placeholder="Describe your dream... (minimum 20 characters for interpretation)"
            placeholderTextColor="#6b6882"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Dream description"
          />
          <TouchableOpacity
            style={[styles.micButton, isListening && styles.micButtonActive]}
            onPress={isListening ? stopVoice : startVoice}
            accessibilityLabel={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
          >
            <Text style={styles.micIcon}>{isListening ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
        </View>

        {isListening ? (
          <Text style={styles.listeningIndicator}>Listening... Tap ⏹ to stop</Text>
        ) : null}

        {!canInterpret && description.length > 0 ? (
          <Text style={styles.lengthHint}>
            Add {MIN_DESCRIPTION - description.trim().length} more characters to enable interpretation
          </Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button label={saving ? 'Saving...' : 'Save Dream'} onPress={handleSave} disabled={saving || !description.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#f0eeff',
  },
  dateRow: {
    paddingVertical: spacing.sm,
  },
  dateLabel: {
    fontSize: fontSize.md,
    color: '#6b6882',
  },
  dateValue: {
    color: '#b399e0',
    fontWeight: '600',
  },
  textAreaContainer: {
    position: 'relative',
  },
  textArea: {
    backgroundColor: '#1a1a3e',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    fontSize: fontSize.md,
    color: '#f0eeff',
    borderWidth: 1,
    borderColor: '#3a3a6a',
    minHeight: 200,
  },
  micButton: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2d2d6b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: '#7c5cbf',
  },
  micIcon: {
    fontSize: 20,
  },
  listeningIndicator: {
    color: '#b399e0',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  lengthHint: {
    color: '#6b6882',
    fontSize: fontSize.sm,
  },
  errorText: {
    color: '#f08080',
    fontSize: fontSize.sm,
  },
});
