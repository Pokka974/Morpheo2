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
import { SegmentedControl } from '@shared/components/SegmentedControl';
import { Toggle } from '@shared/components/Toggle';
import { ChevronLeftIcon } from '@shared/components/icons';
import { generateId } from '@shared/id';
import { EmotionPicker } from '@features/dream-log/EmotionPicker';
import { RecordingBar } from '@features/dream-log/RecordingBar';
import { saveDream } from '@features/dream-log/dreamRepository';
import {
  DreamNotSyncedError,
  syncDreamForInterpretation,
  syncPendingDreams,
} from '@features/dream-log/syncService';
import { useServices } from '@services/useServices';
import {
  colors,
  glow,
  MIN_TOUCH_TARGET,
  radius,
  sizes,
  spacing,
  typography,
} from '@theme/tokens';

const MIN_DESCRIPTION = 20;

type Busy = 'interpret' | 'draft' | null;
type Mode = 'write' | 'dictate';

/**
 * The dream-log screen, restructured to follow the gesture rather than the data model:
 * first *when* (the date, demoted to a pill in the header), then *how* (write or
 * dictate), then *the account itself* — the only region that breathes, set in Fraunces
 * and lit at the border when focused — and only then the metadata a dreamer adds after
 * the telling: what they felt, and whether they knew they were dreaming.
 *
 * It is a modal flow with no tab bar: it opens from the tab bar's centre action and is
 * left through the chevron, which is why the header carries its own back affordance.
 */
export default function DreamLogScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { auth } = useServices();
  const [mode, setMode] = useState<Mode>('write');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [emotions, setEmotions] = useState<string[]>([]);
  const [isLucid, setIsLucid] = useState(false);
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
      // The dictation mode is a promise the device could not keep — fall back to the
      // keyboard rather than leaving the user on a mode with no working control.
      setMode('write');
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

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    if (next === 'dictate') {
      void startVoice();
    } else if (isListening) {
      void stopVoice();
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
        emotions: JSON.stringify(emotions),
        isLucid,
      });
      // Awaited, unlike the draft path below: the interpret Edge Function inserts
      // against a server-side FK on dreams.id, so the row must exist there — not
      // just locally — before the interpretation screen fires its request. This
      // throws if it did not, rather than navigating into a foreign-key violation
      // the user would only ever see as "interpretation unavailable".
      await syncDreamForInterpretation(id);
      setDescription('');
      router.push(
        `/(main)/journal/${id}/interpretation?dreamId=${id}&description=${encodeURIComponent(trimmed)}`
      );
    } catch (e) {
      // The dream is already saved locally either way — the queue will push it on the
      // next reconnect — so this says what is true: kept, not lost, not yet readable.
      if (e instanceof DreamNotSyncedError) {
        setError(t('log.syncRequiredError'));
      } else {
        setError(e instanceof Error ? e.message : t('log.saveError'));
      }
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
        emotions: JSON.stringify(emotions),
        isLucid,
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
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => {
            // Deep-linked straight into the log flow, there is nothing to go back to —
            // the journal is where the chevron means "out of here".
            if (router.canGoBack()) router.back();
            else router.navigate('/(main)/journal');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.headerButton}
        >
          <ChevronLeftIcon />
        </Pressable>
        <Text style={styles.title}>{t('log.title')}</Text>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.changeDreamDate', {
            date: occurredAt.toLocaleDateString(i18n.language),
          })}
          hitSlop={spacing.sm}
          style={styles.datePill}
        >
          <Text style={styles.datePillLabel} numberOfLines={1}>
            {occurredAt.toLocaleDateString(i18n.language, {
              weekday: 'short',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
        </Pressable>
      </View>

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

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SegmentedControl
          fullWidth
          value={mode}
          onChange={handleModeChange}
          segments={[
            { value: 'write', label: t('log.modeWrite') },
            { value: 'dictate', label: t('log.modeDictate') },
          ]}
          testID="log-mode"
        />

        <View style={[styles.editor, isFocused && styles.editorFocused]}>
          <TextInput
            style={styles.textArea}
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
          <View style={styles.editorFooter}>
            {/*
              The counter replaces the old "N more characters" hint: it states what the
              text already is rather than what it still lacks, and turns green the moment
              the dream is long enough to interpret.
            */}
            <Text style={styles.counterHint}>
              {canInterpret ? t('log.longEnough') : t('log.keepGoing')}
            </Text>
            <Text style={[styles.counter, canInterpret && styles.counterMet]}>
              {t('log.charCount', { count: trimmedLength })}
            </Text>
          </View>
        </View>

        {isListening ? (
          <RecordingBar
            elapsedSeconds={elapsed}
            onStop={() => {
              void stopVoice();
            }}
          />
        ) : null}

        <EmotionPicker selected={emotions} onChange={setEmotions} />

        <Toggle
          label={t('log.lucidLabel')}
          hint={isLucid ? t('log.lucidHintOn') : t('log.lucidHintOff')}
          value={isLucid}
          onValueChange={setIsLucid}
          highlight
          testID="log-lucid"
        />

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md + 2,
    paddingBottom: spacing.sm + 4,
  },
  headerButton: {
    width: sizes.circleButton,
    height: sizes.circleButton,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.cardTitle,
    flex: 1,
    fontSize: 20,
    lineHeight: 24,
  },
  datePill: {
    minHeight: MIN_TOUCH_TARGET - spacing.md,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 13,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePillLabel: {
    ...typography.chip,
    color: colors.accentText,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: 14,
  },
  editor: {
    minHeight: 196,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.inputSurface,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.sm + 4,
  },
  editorFocused: {
    borderColor: colors.accent,
    ...glow.soft,
  },
  textArea: {
    flex: 1,
    minHeight: 120,
    padding: 0,
    ...typography.dreamBody,
    fontSize: 16,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  editorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  counterHint: {
    ...typography.meta,
    flex: 1,
    fontSize: 12,
  },
  counter: {
    ...typography.counter,
  },
  counterMet: {
    color: colors.success,
  },
  errorText: {
    ...typography.meta,
    color: colors.error,
  },
  actions: {
    gap: 9,
    marginTop: spacing.xs,
  },
});
