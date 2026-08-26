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
import { useTranslation } from 'react-i18next';
import type Voice from '@react-native-voice/voice';

import { Button } from '@shared/components/Button';
import { SegmentedControl } from '@shared/components/SegmentedControl';
import { Toggle } from '@shared/components/Toggle';
import { RatingScale } from '@shared/components/RatingScale';
import { TagInput } from '@shared/components/TagInput';
import { CollapsibleSection } from '@shared/components/CollapsibleSection';
import { DateTimePickerSheet } from '@shared/components/DateTimePickerSheet';
import { ChevronLeftIcon } from '@shared/components/icons';
import { generateId } from '@shared/id';
import { EmotionPicker } from '@features/dream-log/EmotionPicker';
import { RecordingBar } from '@features/dream-log/RecordingBar';
import {
  getRecentDreamsForLinking,
  getTagSuggestions,
  saveDream,
  type LinkableDream,
} from '@features/dream-log/dreamRepository';
import {
  DREAM_ENDING_OPTIONS,
  DREAM_TYPE_OPTIONS,
  LUCIDITY_LEVELS,
  PRESLEEP_SUBSTANCE_OPTIONS,
  TONE_OPTIONS,
  isLucidLevel,
  type DreamEnding,
  type Lucidity,
  type Tone,
} from '@features/dream-log/dreamMetadata';
import {
  DreamNotSyncedError,
  syncDreamForInterpretation,
  syncPendingDreams,
} from '@features/dream-log/syncService';
import { useServices } from '@services/useServices';
import { colors, glow, MIN_TOUCH_TARGET, radius, sizes, spacing, typography } from '@theme/tokens';

const MIN_DESCRIPTION = 20;

type Busy = 'interpret' | 'draft' | null;
type Mode = 'write' | 'dictate';
type ActivePicker = 'occurredAt' | 'bedtime' | 'wakeTime' | null;

function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * "Nuit du 22 au 23 août" — the dream's date is really a night spanning two
 * calendar days, so it is described as one rather than as the single day
 * `occurredAt` stores. Crosses a month boundary correctly (day 1 of a new month
 * gets its own month name rather than silently reusing the first day's).
 */
function formatNightLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: string,
  date: Date
): string {
  const next = new Date(date);
  next.setDate(date.getDate() + 1);
  const day = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric' });
  const month = (d: Date) => d.toLocaleDateString(locale, { month: 'long' });
  const sameMonth =
    date.getMonth() === next.getMonth() && date.getFullYear() === next.getFullYear();
  return sameMonth
    ? t('log.nightOfSameMonth', { d1: day(date), d2: day(next), month: month(date) })
    : t('log.nightOfCrossMonth', {
        d1: day(date),
        month1: month(date),
        d2: day(next),
        month2: month(next),
      });
}

/**
 * The dream-log screen, restructured to follow the gesture rather than the data model:
 * first *when* (the date, demoted to a pill in the header), then *how* (write or
 * dictate), then *the account itself* — the only region that breathes, set in Fraunces
 * and lit at the border when focused — and only then the metadata a dreamer adds after
 * the telling: what they felt, whether they knew they were dreaming, and a second,
 * collapsed-by-default layer (sleep, the dream's own shape, who and where, and a
 * private context block that never leaves this device).
 *
 * It is a modal flow with no tab bar: it opens from the tab bar's centre action and is
 * left through the chevron, which is why the header carries its own back affordance.
 */
export default function DreamLogScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { auth } = useServices();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('write');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [emotions, setEmotions] = useState<string[]>([]);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Sleep ---
  const [bedtime, setBedtime] = useState<Date | null>(null);
  const [wakeTime, setWakeTime] = useState<Date | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  // A stable fallback for the two time pickers while their value is still unset.
  // `bedtime ?? new Date()` inline would create a *new* Date object on every
  // render of this large, frequently-re-rendering screen — and since that new
  // reference flows into DateTimePickerSheet's `useEffect([visible, value])`, it
  // reset the in-progress scroll back to "now" on whatever render happened to
  // land mid-gesture. A ref keeps the same object across renders instead.
  const unsetPickerTime = useRef(new Date()).current;

  // --- The dream itself ---
  const [clarity, setClarity] = useState<number | null>(null);
  const [lucidity, setLucidity] = useState<Lucidity>('none');
  const [tone, setTone] = useState<Tone | null>(null);
  const [dreamEnding, setDreamEnding] = useState<DreamEnding | null>(null);
  const [dreamType, setDreamType] = useState<string[]>([]);

  // --- Who, where ---
  const [characters, setCharacters] = useState<string[]>([]);
  const [places, setPlaces] = useState<string[]>([]);
  const [characterSuggestions, setCharacterSuggestions] = useState<string[]>([]);
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([]);
  const [isLinked, setIsLinked] = useState(false);
  const [linkedDreamId, setLinkedDreamId] = useState<string | null>(null);
  const [linkableDreams, setLinkableDreams] = useState<LinkableDream[] | null>(null);

  // --- Personal context (private, local-only) ---
  const [dayStress, setDayStress] = useState<number | null>(null);
  const [presleepSubstances, setPresleepSubstances] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    };
  }, []);

  useEffect(() => {
    async function loadSuggestions() {
      const session = await auth.getSession();
      if (!session) return;
      setUserId(session.user.id);
      const [chars, spots] = await Promise.all([
        getTagSuggestions(session.user.id, 'characters'),
        getTagSuggestions(session.user.id, 'places'),
      ]);
      setCharacterSuggestions(chars);
      setPlaceSuggestions(spots);
    }
    void loadSuggestions();
  }, [auth]);

  const toggleLinked = async (next: boolean) => {
    setIsLinked(next);
    if (!next) {
      setLinkedDreamId(null);
      return;
    }
    if (linkableDreams === null && userId) {
      const recent = await getRecentDreamsForLinking(userId, null);
      setLinkableDreams(recent);
    }
  };

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

  const buildDraft = (id: string, ownerId: string, trimmedDescription: string) => ({
    id,
    userId: ownerId,
    description: trimmedDescription,
    occurredAt: occurredAt.toISOString().slice(0, 10),
    emotions: JSON.stringify(emotions),
    isLucid: isLucidLevel(lucidity),
    bedtime: bedtime ? toTimeString(bedtime) : null,
    wakeTime: wakeTime ? toTimeString(wakeTime) : null,
    sleepQuality,
    clarity,
    lucidity,
    tone,
    dreamEnding,
    dreamType: JSON.stringify(dreamType),
    characters: JSON.stringify(characters),
    places: JSON.stringify(places),
    linkedDreamId,
    dayStress,
    presleepSubstances: JSON.stringify(presleepSubstances),
  });

  /**
   * Clears every field that belongs to the dream just saved.
   *
   * The log screen is a tab, so Expo Router keeps it mounted after a save and navigating
   * back returns to the same component instance with its state intact. Both save paths
   * used to clear `description` alone, which left the previous dream's emotions, tone,
   * clarity, sleep times, characters, places and private context sitting in the form —
   * pre-filled, and silently saved onto the *next* dream unless the user noticed and
   * cleared them by hand.
   *
   * Deliberately not reset: `mode` (a UI preference, not dream data), the suggestion and
   * linkable-dream lists (loaded reference data, not input), and the transient
   * picker/focus/recording flags, which their own handlers already own.
   */
  const resetForm = () => {
    setDescription('');
    setOccurredAt(new Date());
    setEmotions([]);
    setError(null);

    setBedtime(null);
    setWakeTime(null);
    setSleepQuality(null);

    setClarity(null);
    setLucidity('none');
    setTone(null);
    setDreamEnding(null);
    setDreamType([]);

    setCharacters([]);
    setPlaces([]);
    setIsLinked(false);
    setLinkedDreamId(null);

    setDayStress(null);
    setPresleepSubstances([]);
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
      await saveDream(buildDraft(id, session.user.id, trimmed));
      // Awaited, unlike the draft path below: the interpret Edge Function inserts
      // against a server-side FK on dreams.id, so the row must exist there — not
      // just locally — before the interpretation screen fires its request. This
      // throws if it did not, rather than navigating into a foreign-key violation
      // the user would only ever see as "interpretation unavailable".
      await syncDreamForInterpretation(id);
      resetForm();
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
      await saveDream(buildDraft(generateId(), session.user.id, description.trim()));
      resetForm();
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

  const linkedDream = linkableDreams?.find(d => d.id === linkedDreamId) ?? null;

  const toggleDreamType = (value: string) => {
    setDreamType(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));
  };
  const togglePresleepSubstance = (value: string) => {
    setPresleepSubstances(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  };

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
        {/* Balances the back button's width so the title stays visually centred
            now that the date pill (moved below, into the night summary) no
            longer occupies this side. */}
        <View style={styles.headerSpacer} />
      </View>

      <DateTimePickerSheet
        visible={activePicker === 'occurredAt'}
        mode="date"
        value={occurredAt}
        title={t('log.dateLabel')}
        minimumDate={minDate}
        maximumDate={maxDate}
        onConfirm={date => {
          setOccurredAt(date);
          setActivePicker(null);
        }}
        onCancel={() => setActivePicker(null)}
      />
      <DateTimePickerSheet
        visible={activePicker === 'bedtime'}
        mode="time"
        value={bedtime ?? unsetPickerTime}
        title={t('log.bedtimeLabel')}
        onConfirm={date => {
          setBedtime(date);
          setActivePicker(null);
        }}
        onCancel={() => setActivePicker(null)}
      />
      <DateTimePickerSheet
        visible={activePicker === 'wakeTime'}
        mode="time"
        value={wakeTime ?? unsetPickerTime}
        title={t('log.wakeTimeLabel')}
        onConfirm={date => {
          setWakeTime(date);
          setActivePicker(null);
        }}
        onCancel={() => setActivePicker(null)}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => setActivePicker('occurredAt')}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.changeDreamDate', {
            date: occurredAt.toLocaleDateString(i18n.language),
          })}
          style={styles.nightSummary}
        >
          <Text style={styles.nightTitle}>{formatNightLabel(t, i18n.language, occurredAt)}</Text>
          <View style={styles.nightMetaRow}>
            <Text style={styles.nightMeta}>{t('log.loggedToday')}</Text>
            <Text style={styles.nightMeta}> · </Text>
            <Text style={styles.nightEdit}>{t('log.editDate')}</Text>
          </View>
        </Pressable>

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

        <CollapsibleSection title={t('log.sectionSleep')}>
          <View style={styles.timeRow}>
            <Pressable
              onPress={() => setActivePicker('bedtime')}
              accessibilityRole="button"
              accessibilityLabel={t('log.bedtimeLabel')}
              style={styles.timePill}
            >
              <Text style={styles.timePillLabel}>{t('log.bedtimeLabel')}</Text>
              <Text style={styles.timePillValue}>{bedtime ? toTimeString(bedtime) : '—'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setActivePicker('wakeTime')}
              accessibilityRole="button"
              accessibilityLabel={t('log.wakeTimeLabel')}
              style={styles.timePill}
            >
              <Text style={styles.timePillLabel}>{t('log.wakeTimeLabel')}</Text>
              <Text style={styles.timePillValue}>{wakeTime ? toTimeString(wakeTime) : '—'}</Text>
            </Pressable>
          </View>
          <RatingScale
            label={t('log.sleepQualityLabel')}
            value={sleepQuality}
            onChange={setSleepQuality}
            variant="dot"
            testID="log-sleep-quality"
          />
        </CollapsibleSection>

        <CollapsibleSection title={t('log.sectionDream')}>
          <RatingScale
            label={t('log.clarityLabel')}
            value={clarity}
            onChange={setClarity}
            variant="bar"
            testID="log-clarity"
          />

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('log.lucidityLabel')}</Text>
            <SegmentedControl
              value={lucidity}
              onChange={setLucidity}
              segments={LUCIDITY_LEVELS.map(level => ({
                value: level,
                label: t(`log.lucidity${capitalize(level)}`),
              }))}
              testID="log-lucidity"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('log.toneLabel')}</Text>
            <View style={styles.chipRow}>
              {TONE_OPTIONS.map(option => (
                <OptionChip
                  key={option}
                  label={t(`log.tone${capitalize(option)}`)}
                  selected={tone === option}
                  onPress={() => setTone(prev => (prev === option ? null : option))}
                />
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('log.dreamEndingLabel')}</Text>
            <View style={styles.chipRow}>
              {DREAM_ENDING_OPTIONS.map(option => (
                <OptionChip
                  key={option}
                  label={t(`log.dreamEnding${capitalize(option)}`)}
                  selected={dreamEnding === option}
                  onPress={() => setDreamEnding(prev => (prev === option ? null : option))}
                />
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('log.dreamTypeLabel')}</Text>
            <View style={styles.chipRow}>
              {DREAM_TYPE_OPTIONS.map(option => (
                <OptionChip
                  key={option}
                  label={t(`dreamType.${option}`)}
                  selected={dreamType.includes(option)}
                  onPress={() => toggleDreamType(option)}
                />
              ))}
            </View>
          </View>
        </CollapsibleSection>

        <CollapsibleSection title={t('log.sectionWhoWhere')}>
          <TagInput
            label={t('log.charactersLabel')}
            placeholder={t('log.charactersPlaceholder')}
            tags={characters}
            onChange={setCharacters}
            suggestions={characterSuggestions}
            testID="log-characters"
          />
          <TagInput
            label={t('log.placesLabel')}
            placeholder={t('log.placesPlaceholder')}
            tags={places}
            onChange={setPlaces}
            suggestions={placeSuggestions}
            testID="log-places"
          />

          <Toggle
            label={t('log.linkedDreamLabel')}
            hint={t('log.linkedDreamHint')}
            value={isLinked}
            onValueChange={next => {
              void toggleLinked(next);
            }}
            testID="log-linked-toggle"
          />

          {isLinked ? (
            <View style={styles.linkedPicker}>
              <Text style={styles.fieldLabel}>{t('log.linkedDreamPickerTitle')}</Text>
              {linkableDreams === null ? null : linkableDreams.length === 0 ? (
                <Text style={styles.emptyLinkable}>{t('log.linkedDreamNone')}</Text>
              ) : (
                <View style={styles.chipRow}>
                  {linkableDreams.map(candidate => (
                    <OptionChip
                      key={candidate.id}
                      label={candidate.title}
                      selected={linkedDreamId === candidate.id}
                      onPress={() =>
                        setLinkedDreamId(prev => (prev === candidate.id ? null : candidate.id))
                      }
                    />
                  ))}
                </View>
              )}
              {linkedDream ? <Text style={styles.meta}>{linkedDream.title}</Text> : null}
            </View>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection title={t('log.sectionPrivate')}>
          <Text style={styles.privateHint}>{t('log.privateHint')}</Text>
          <RatingScale
            label={t('log.dayStressLabel')}
            value={dayStress}
            onChange={setDayStress}
            variant="bar"
            testID="log-day-stress"
          />
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('log.presleepSubstancesLabel')}</Text>
            <View style={styles.chipRow}>
              {PRESLEEP_SUBSTANCE_OPTIONS.map(option => (
                <OptionChip
                  key={option}
                  label={t(`presleepSubstance.${option}`)}
                  selected={presleepSubstances.includes(option)}
                  onPress={() => togglePresleepSubstance(option)}
                />
              ))}
            </View>
          </View>
        </CollapsibleSection>

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

function capitalize<T extends string>(value: T): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** A single-purpose toggle pill shared by the dream-type, tone, ending and
 * pre-sleep-substance option rows — selectable, and deselectable on a second tap
 * for the single-select fields (the parent decides whether that clears to `null`
 * or removes one entry from a multi-select array). */
function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      hitSlop={spacing.xs}
      style={[styles.optionChip, selected && styles.optionChipSelected]}
    >
      <Text style={[styles.optionChipLabel, selected && styles.optionChipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
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
  headerSpacer: {
    width: sizes.circleButton,
    height: sizes.circleButton,
  },
  nightSummary: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    gap: 3,
  },
  nightTitle: {
    ...typography.dreamTitle,
    fontSize: 19,
    lineHeight: 24,
  },
  nightMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nightMeta: {
    ...typography.meta,
    fontSize: 12,
  },
  nightEdit: {
    ...typography.meta,
    fontSize: 12,
    color: colors.accentText,
    textDecorationLine: 'underline',
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
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timePill: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.chip,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  timePillLabel: {
    ...typography.overline,
    fontSize: 10,
  },
  timePillValue: {
    ...typography.cardTitle,
    fontSize: 15,
  },
  fieldGroup: {
    gap: spacing.xs + 2,
  },
  fieldLabel: {
    ...typography.overline,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  optionChip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radius.chip,
    backgroundColor: colors.chipNeutralFill,
    borderWidth: 1,
    borderColor: colors.chipNeutralBorder,
  },
  optionChipSelected: {
    backgroundColor: `${colors.accent}1f`,
    borderColor: colors.accent,
  },
  optionChipLabel: {
    ...typography.chip,
    fontSize: 13,
    color: colors.textMuted,
  },
  optionChipLabelSelected: {
    color: colors.accentText,
  },
  linkedPicker: {
    gap: spacing.xs + 2,
  },
  emptyLinkable: {
    ...typography.meta,
  },
  meta: {
    ...typography.meta,
  },
  privateHint: {
    ...typography.meta,
    fontSize: 12,
  },
});
