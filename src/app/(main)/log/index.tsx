import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import type Voice from '@react-native-voice/voice';

import { Button } from '@shared/components/Button';
import { MicIcon, StopIcon } from '@shared/components/icons';
import { generateId } from '@shared/id';
import { saveDream } from '@features/dream-log/dreamRepository';
import { syncPendingDreams } from '@features/dream-log/syncService';
import { useServices } from '@services/useServices';
import { colors, glow, radius, spacing, typography } from '@theme/tokens';

const MIN_DESCRIPTION = 20;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Busy = 'interpret' | 'draft' | null;

export default function DreamLogScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { auth } = useServices();
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, []);

  const startVoice = async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const VoiceModule = (require('@react-native-voice/voice') as { default: typeof Voice })
        .default;
      VoiceModule.onSpeechResults = e => {
        if (e.value?.[0]) {
          setDescription(prev => (prev ? prev + ' ' + e.value![0] : e.value![0]!));
        }
      };
      await VoiceModule.start('en-US');
      setIsListening(true);
      setElapsed(0);
      elapsedTimer.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch {
      setError(t('log.micUnavailable'));
    }
  };

  const stopVoice = async () => {
    if (elapsedTimer.current) {
      clearInterval(elapsedTimer.current);
      elapsedTimer.current = null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const VoiceModule = (require('@react-native-voice/voice') as { default: typeof Voice })
        .default;
      await VoiceModule.stop();
    } finally {
      setIsListening(false);
    }
  };

  const requireSession = async () => {
    const session = await auth.getSession();
    if (!session) {
      router.replace('/(auth)/sign-in');
      return null;
    }
    return session;
  };

  const handleInterpretNow = async () => {
    if (!canInterpret) return;
    setBusy('interpret');
    setError(null);
    try {
      const session = await requireSession();
      if (!session) return;
      const id = generateId();
      const trimmed = description.trim();
      await saveDream({
        id,
        userId: session.user.id,
        description: trimmed,
        occurredAt: occurredAt.toISOString().slice(0, 10),
      });
      // Awaited, unlike the draft path below: the interpret Edge Function inserts
      // against a server-side FK on dreams.id, so the row must exist there — not
      // just locally — before the interpretation screen fires its request.
      await syncPendingDreams();
      setDescription('');
      router.push(
        `/(main)/journal/${id}/interpretation?dreamId=${id}&description=${encodeURIComponent(trimmed)}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('log.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = async () => {
    setBusy('draft');
    setError(null);
    try {
      const session = await requireSession();
      if (!session) return;
      await saveDream({
        id: generateId(),
        userId: session.user.id,
        description: description.trim(),
        occurredAt: occurredAt.toISOString().slice(0, 10),
      });
      setDescription('');
      // Best-effort — the offline-first sync queue drains this on next reconnect
      // regardless, and a draft save shouldn't block on network.
      syncPendingDreams().catch((err: unknown) => {
        console.error('Immediate post-save sync failed; dream stays queued:', err);
      });
      router.navigate('/(main)/journal');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('log.saveError'));
    } finally {
      setBusy(null);
    }
  };

  const maxDate = new Date();
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 1);

  const trimmedLength = description.trim().length;
  const canInterpret = trimmedLength >= MIN_DESCRIPTION;
  const canSaveDraft = trimmedLength > 0;
  const isBusy = busy !== null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('log.title')}</Text>

        <Pressable
          style={styles.dateRow}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
        >
          <Text style={styles.dateLabel}>
            {t('log.dateLabel')}:{' '}
            <Text style={styles.dateValue}>{occurredAt.toLocaleDateString(i18n.language)}</Text>
          </Text>
        </Pressable>

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

        <TextInput
          style={[styles.textArea, isFocused && styles.textAreaFocused]}
          placeholder={t('log.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Dream description"
        />

        {isListening ? (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingLabel}>
              {t('log.recording')} · {formatElapsed(elapsed)}
            </Text>
            <Pressable
              onPress={() => {
                void stopVoice();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('log.micStop')}
              hitSlop={8}
            >
              <StopIcon />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.micRow}
            onPress={() => {
              void startVoice();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('log.micStart')}
          >
            <MicIcon size={18} />
            <Text style={styles.micLabel}>{t('log.micStart')}</Text>
          </Pressable>
        )}

        {!canInterpret && trimmedLength > 0 ? (
          <Text style={styles.lengthHint}>
            {t('log.minLengthRemaining', { count: MIN_DESCRIPTION - trimmedLength })}
          </Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button
            label={t('log.interpretCta')}
            onPress={() => {
              void handleInterpretNow();
            }}
            disabled={!canInterpret || isBusy}
            loading={busy === 'interpret'}
            fullWidth
          />
          <Button
            label={t('dream.saveDraft')}
            variant="secondary"
            onPress={() => {
              void handleSaveDraft();
            }}
            disabled={!canSaveDraft || isBusy}
            loading={busy === 'draft'}
            fullWidth
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.screenTitle,
  },
  dateRow: {
    paddingVertical: spacing.xs,
  },
  dateLabel: {
    ...typography.meta,
  },
  dateValue: {
    ...typography.chip,
    color: colors.accentText,
  },
  textArea: {
    backgroundColor: colors.inputSurface,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 200,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...typography.dreamBody,
    fontSize: 16,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  textAreaFocused: {
    borderColor: colors.accent,
    ...glow.soft,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  micLabel: {
    ...typography.chip,
    color: colors.accentText,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderMystic,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.error,
  },
  recordingLabel: {
    ...typography.body,
    flex: 1,
    color: colors.textSecondary,
  },
  lengthHint: {
    ...typography.meta,
  },
  errorText: {
    ...typography.meta,
    color: colors.error,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
