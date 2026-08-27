import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { deleteDream } from '@features/dream-log/dreamRepository';
import { syncPendingDreams } from '@features/dream-log/syncService';
import { makeMediaCache } from '@features/sync/mediaCache';
import { isLucidLevel, type Lucidity, type Tone } from '@features/dream-log/dreamMetadata';
import { bedtimeStraddlesMidnight, formatNightLabel } from '@features/dream-log/nightLabel';
import { getRecurrenceChains, type RecurrenceChain } from '@features/recurrence/recurrenceChains';
import {
  getMonthlyThemeForDream,
  type MonthlyThemeRecurrence,
} from '@features/recurrence/recurrenceRepository';
import { LoadingState } from '@shared/components/LoadingState';
import { ErrorState } from '@shared/components/ErrorState';
import { Button } from '@shared/components/Button';
import { Chip, ChipRow } from '@shared/components/Chip';
import { ClarityDots } from '@shared/components/ClarityDots';
import { CollapsibleSection } from '@shared/components/CollapsibleSection';
import { CloseIcon, SymbolIcon } from '@shared/components/icons';
import { ordinal } from '@shared/ordinal';
import { DreamImageActionBar } from '@features/media-generation/DreamImageActionBar';
import { useImageGeneration } from '@features/media-generation/useImageGeneration';
import { useServices } from '@services/useServices';
import {
  colors,
  glow,
  gradients,
  radius,
  sizes,
  spacing,
  toneColors,
  typography,
} from '@theme/tokens';
import type {
  CulturalReference,
  InterpretationResult,
} from '@services/ai/interpretation/InterpretationService';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';

interface DreamDetail {
  id: string;
  description: string;
  occurredAt: string;
  emotions: string[];
  lucidity: Lucidity;
  tone: Tone | null;
  clarity: number | null;
  sleepQuality: number | null;
  bedtime: string | null;
  wakeTime: string | null;
  dreamEnding: 'resolved' | 'unresolved' | 'fragmented' | null;
  dreamType: string[];
  characters: string[];
  places: string[];
  linkedDreamId: string | null;
  loggedAt: string;
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** "23:15" + "07:10" → { hours: 7, minutes: 55 }, crossing midnight when needed. */
function sleepDuration(bedtime: string, wakeTime: string): { hours: number; minutes: number } {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  let totalMinutes = wh! * 60 + wm! - (bh! * 60 + bm!);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

const HERO_HEIGHT = 320;
/** How far the content sheet rides up over the hero image. */
const CONTENT_OVERLAP = 56;

export default function DreamDetailScreen() {
  const { dreamId } = useLocalSearchParams<{ dreamId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const { imageGeneration, auth } = services;

  const [dream, setDream] = useState<DreamDetail | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [imageMedia, setImageMedia] = useState<MediaResult | null>(null);
  const [chain, setChain] = useState<RecurrenceChain | null>(null);
  const [monthlyTheme, setMonthlyTheme] = useState<MonthlyThemeRecurrence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreenOpen, setFullscreenOpen] = useState(false);

  const { state: imageState, generate, regenerate } = useImageGeneration();

  useEffect(() => {
    async function load() {
      try {
        const dreamRow = await db.getFirstAsync<{
          id: string;
          description: string;
          occurred_at: string;
          emotions: string;
          lucidity: string;
          tone: string | null;
          clarity: number | null;
          sleep_quality: number | null;
          bedtime: string | null;
          wake_time: string | null;
          dream_ending: string | null;
          dream_type: string;
          characters: string;
          places: string;
          linked_dream_id: string | null;
          logged_at: string;
        }>(
          `SELECT id, description, occurred_at, emotions, lucidity, tone, clarity,
                  sleep_quality, bedtime, wake_time, dream_ending, dream_type,
                  characters, places, linked_dream_id, logged_at
           FROM dreams WHERE id = ? AND is_deleted = 0`,
          dreamId
        );
        if (!dreamRow) return;
        setDream({
          id: dreamRow.id,
          description: dreamRow.description,
          occurredAt: dreamRow.occurred_at,
          emotions: parseStringArray(dreamRow.emotions),
          lucidity: dreamRow.lucidity as Lucidity,
          tone: dreamRow.tone as Tone | null,
          clarity: dreamRow.clarity,
          sleepQuality: dreamRow.sleep_quality,
          bedtime: dreamRow.bedtime,
          wakeTime: dreamRow.wake_time,
          dreamEnding: dreamRow.dream_ending as DreamDetail['dreamEnding'],
          dreamType: parseStringArray(dreamRow.dream_type),
          characters: parseStringArray(dreamRow.characters),
          places: parseStringArray(dreamRow.places),
          linkedDreamId: dreamRow.linked_dream_id,
          loggedAt: dreamRow.logged_at,
        });

        const interpRow = await db.getFirstAsync<{
          id: string;
          overall_reading: string;
          keywords: string;
          emotions: string;
          cultural_references: string;
          confidence: string | null;
          prompt_version: string;
          model_used: string;
          created_at: string;
          archetype: string | null;
          themes: string | null;
          symbolic_density: number | null;
          image_prompt: string | null;
        }>(
          'SELECT id, overall_reading, keywords, emotions, cultural_references, confidence, prompt_version, model_used, created_at, archetype, themes, symbolic_density, image_prompt FROM interpretations WHERE dream_id = ? ORDER BY created_at DESC LIMIT 1',
          dreamId
        );
        if (interpRow) {
          const confidence = (interpRow.confidence ?? 'medium') as 'high' | 'medium' | 'low';
          setInterpretation({
            id: interpRow.id,
            dreamId,
            overallReading: interpRow.overall_reading,
            keywords: JSON.parse(interpRow.keywords ?? '[]') as string[],
            emotions: JSON.parse(interpRow.emotions ?? '[]') as string[],
            culturalReferences: JSON.parse(
              interpRow.cultural_references ?? '[]'
            ) as CulturalReference[],
            confidence,
            isDegraded: confidence === 'low',
            promptVersion: interpRow.prompt_version,
            modelUsed: interpRow.model_used,
            createdAt: interpRow.created_at,
            archetype: interpRow.archetype,
            themes: parseStringArray(interpRow.themes),
            symbolicDensity: interpRow.symbolic_density,
            imagePrompt: interpRow.image_prompt,
          });
        }

        const media = await imageGeneration.getImage(dreamId);
        setImageMedia(media);

        const session = await auth.getSession();
        if (session) {
          const chains = await getRecurrenceChains(session.user.id);
          setChain(chains.find(c => c.dreams.some(d => d.id === dreamId)) ?? null);
        }
        setMonthlyTheme(await getMonthlyThemeForDream(dreamId, dreamRow.occurred_at));
      } catch (err) {
        console.error('Failed to load dream detail:', err);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [dreamId, imageGeneration, auth]);

  const confirmDelete = async () => {
    await deleteDream(dreamId);
    // The entry is already gone from every screen; this starts the server-side purge
    // now rather than at the next foreground/reconnect. Best-effort — the dream stays
    // queued and drains later if this device is offline.
    syncPendingDreams(makeMediaCache(services)).catch((err: unknown) => {
      console.error('Immediate purge after delete failed; dream stays queued:', err);
    });
    router.back();
  };

  const handleDelete = () => {
    Alert.alert(t('dream.deleteConfirmTitle'), t('dream.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('dream.delete'),
        style: 'destructive',
        onPress: () => {
          void confirmDelete();
        },
      },
    ]);
  };

  if (isLoading) return <LoadingState message={t('common.loading')} />;
  if (!dream) return <ErrorState message={t('dream.notFound')} fullScreen />;

  const activeImage = imageState.status === 'success' ? imageState.media : imageMedia;
  // Prefer the on-device copy so an opened dream never re-fetches from the provider
  // (FR-013); fall back to the signed URL until the cache is warm.
  const heroUri = activeImage?.localCachePath ?? activeImage?.signedUrl ?? null;

  const isImageGenerating = imageState.status === 'generating';

  // Every non-success, non-generating imageState was previously dropped on the
  // floor — the action bar fell back to a generic "No illustration yet" no matter
  // why generation actually failed. Surface the real reason.
  const imageErrorMessage =
    imageState.status === 'error'
      ? imageState.message
      : imageState.status === 'safety_blocked'
        ? t('dream.imageSafetyBlockedBody')
        : imageState.status === 'regeneration_limit'
          ? t('dream.imageRegenLimitBody', { max: imageState.max })
          : imageState.status === 'image_limit'
            ? t('dream.imageLimitReachedBody', {
                date: imageState.resetDate.toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'long',
                }),
              })
            : null;
  const occurred = new Date(dream.occurredAt);
  const dateLabel = occurred.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = occurred.toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  // The dreamer's own emotions outrank the AI's reading — same preference the
  // journal list applies, since they were the one who had the dream.
  const headlineEmotions = dream.emotions.length
    ? dream.emotions
    : (interpretation?.emotions ?? []);

  const hasSleepInfo = dream.bedtime != null && dream.wakeTime != null;
  const duration = hasSleepInfo ? sleepDuration(dream.bedtime!, dream.wakeTime!) : null;

  // One entry per context field the dreamer actually filled in, so the collapsed
  // header can say "9 fields noted" without anyone having to expand it to find out.
  // Characters and places count as one field each, not one per tag.
  const contextFields = [
    dream.bedtime,
    dream.wakeTime,
    dream.sleepQuality,
    dream.clarity,
    dream.lucidity !== 'none' ? dream.lucidity : null,
    dream.tone,
    dream.dreamEnding,
    dream.dreamType.length ? dream.dreamType : null,
    dream.characters.length ? dream.characters : null,
    dream.places.length ? dream.places : null,
  ].filter(v => v != null).length;
  const hasContext = contextFields > 0;

  const logged = new Date(dream.loggedAt);
  const contextCaption = [
    // Only worth naming the night when the bedtime puts it on the evening before —
    // otherwise it just repeats the date already in the header. The night's first day
    // is then the day before the one the dream is filed under.
    bedtimeStraddlesMidnight(dream.bedtime)
      ? formatNightLabel(t, i18n.language, addDays(new Date(dream.occurredAt), -1))
      : null,
    t('dream.loggedAtNote', {
      date: logged.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
      time: logged.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    }),
  ]
    .filter(Boolean)
    .join(' · ');

  const chainDreams = chain?.dreams.filter(d => d.id !== dream.id) ?? [];

  // Pre-interpretation-016 rows carry no archetype/themes/density yet — hide the block
  // rather than render an empty dashed card for them.
  const hasAiMetadata = Boolean(
    interpretation?.archetype || interpretation?.themes.length || interpretation?.symbolicDensity
  );

  const monthlyThemeHeader = monthlyTheme
    ? t('dream.monthlyThemeNote', {
        ordinal: ordinal(monthlyTheme.ordinal, i18n.language.startsWith('fr') ? 'fr' : 'en'),
        term: monthlyTheme.theme,
      })
    : null;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {isImageGenerating ? (
            <View style={styles.heroPlaceholder}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          ) : heroUri ? (
            <Pressable
              onPress={() => setFullscreenOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('dream.imageIllustrationLabel')}
              style={StyleSheet.absoluteFill}
            >
              <Image
                source={{ uri: heroUri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={300}
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.heroPlaceholderText}>{t('journal.generatedVisual')}</Text>
            </View>
          )}
          <LinearGradient
            colors={[...gradients.heroFade.colors]}
            locations={[...gradients.heroFade.locations]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.heroButton, { top: insets.top + spacing.sm }]}
          >
            <Text style={styles.heroGlyph}>‹</Text>
          </Pressable>
        </View>

        <View style={styles.sheet}>
          <DreamImageActionBar
            media={activeImage}
            isGenerating={isImageGenerating}
            errorMessage={imageErrorMessage}
            canRegenerate={true}
            onGenerate={() => {
              void generate({
                dreamId: dream.id,
                description: dream.description,
                keywords: interpretation?.keywords ?? [],
              });
            }}
            onRegenerate={() => {
              void regenerate({
                dreamId: dream.id,
                description: dream.description,
                keywords: interpretation?.keywords ?? [],
              });
            }}
          />

          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {dateLabel} · {timeLabel}
            </Text>
            {isLucidLevel(dream.lucidity) ? (
              <>
                <View style={styles.lucidDot} />
                <Text style={styles.lucidLabel}>{t('journal.lucid')}</Text>
              </>
            ) : null}
            {dream.tone ? (
              <View
                style={[styles.toneDot, { backgroundColor: toneColors[dream.tone] }]}
                accessibilityLabel={t('a11y.toneIndicator', {
                  tone: t(`log.tone${capitalize(dream.tone)}`),
                })}
              />
            ) : null}
          </View>

          <Text style={styles.title}>{firstLine(dream.description)}</Text>

          {headlineEmotions.length ? (
            <ChipRow>
              {headlineEmotions.slice(0, 3).map(emotion => (
                <Chip key={emotion} label={emotion} />
              ))}
            </ChipRow>
          ) : null}

          <Text style={styles.narrative}>{dream.description}</Text>

          {interpretation ? (
            <LinearGradient
              colors={[...gradients.interpretation.colors]}
              locations={[...gradients.interpretation.locations]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.interpretationCard}
            >
              <View style={styles.interpretationHeader}>
                <View style={styles.interpretationBrand}>
                  <LinearGradient
                    colors={[...gradients.fab.colors]}
                    locations={[...gradients.fab.locations]}
                    style={styles.interpretationMark}
                  />
                  <Text style={styles.interpretationTitle}>{t('dream.interpretation')}</Text>
                </View>
              </View>

              {interpretation.isDegraded ? (
                <Text style={styles.degraded}>{t('dream.degradedNotice')}</Text>
              ) : null}

              <Text style={styles.interpretationBody}>{interpretation.overallReading}</Text>

              {interpretation.keywords.length ? (
                <ChipRow>
                  {interpretation.keywords.map(keyword => (
                    <Chip key={keyword} label={keyword} variant="keyword" />
                  ))}
                </ChipRow>
              ) : null}

              <View style={styles.interpretationActions}>
                <Button
                  label={t('dream.anotherAngle')}
                  variant="secondary"
                  onPress={() =>
                    router.push(
                      `/(main)/journal/${dream.id}/interpretation?dreamId=${dream.id}&description=${encodeURIComponent(dream.description)}`
                    )
                  }
                  style={styles.flexAction}
                />
              </View>
            </LinearGradient>
          ) : (
            <Button
              label={t('dream.interpretButton')}
              onPress={() =>
                router.push(
                  `/(main)/journal/${dream.id}/interpretation?dreamId=${dream.id}&description=${encodeURIComponent(dream.description)}`
                )
              }
              fullWidth
            />
          )}

          {hasContext ? (
            <CollapsibleSection
              title={t('dream.contextTitle')}
              summary={t('dream.contextFieldCount', { count: contextFields })}
            >
              {/* The night — when the dreamer slept, and how well. */}
              {dream.bedtime || dream.wakeTime || duration || dream.sleepQuality != null ? (
                <View style={styles.contextBlock}>
                  <Text style={styles.contextBlockLabel}>{t('dream.contextNightLabel')}</Text>

                  {dream.bedtime || dream.wakeTime || duration ? (
                    <View style={styles.metricRow}>
                      {dream.bedtime ? (
                        <MetricBox label={t('log.bedtimeLabel')} value={dream.bedtime} />
                      ) : null}
                      {dream.wakeTime ? (
                        <MetricBox label={t('log.wakeTimeLabel')} value={dream.wakeTime} />
                      ) : null}
                      {duration ? (
                        <MetricBox
                          label={t('dream.durationLabel')}
                          value={t('dream.sleepDuration', {
                            hours: duration.hours,
                            minutes: duration.minutes,
                          })}
                        />
                      ) : null}
                    </View>
                  ) : null}

                  {dream.sleepQuality != null ? (
                    <ScaleRow
                      label={t('log.sleepQualityLabel')}
                      value={dream.sleepQuality}
                      accessibilityLabel={t('a11y.sleepQualityValue', {
                        value: dream.sleepQuality,
                        max: 5,
                      })}
                    />
                  ) : null}

                  <Text style={styles.contextCaption}>{contextCaption}</Text>
                </View>
              ) : null}

              {/* The dream itself — how it looked, how it felt, how it ended. */}
              {dream.clarity != null ||
              dream.lucidity !== 'none' ||
              dream.tone ||
              dream.dreamEnding ||
              dream.dreamType.length ? (
                <View style={styles.contextBlock}>
                  <Text style={styles.contextBlockLabel}>{t('dream.contextDreamLabel')}</Text>

                  {dream.clarity != null ? (
                    <ScaleRow
                      label={t('log.clarityLabel')}
                      value={dream.clarity}
                      accessibilityLabel={t('a11y.clarityValue', { value: dream.clarity, max: 5 })}
                    />
                  ) : null}

                  <View style={styles.fieldPillRow}>
                    {dream.lucidity !== 'none' ? (
                      <FieldPill
                        label={t('log.lucidityLabel')}
                        value={t(`log.lucidity${capitalize(dream.lucidity)}`)}
                        // Amber tracks the lucid rungs and nothing else on this screen.
                        valueStyle={
                          isLucidLevel(dream.lucidity) ? styles.fieldPillLucid : undefined
                        }
                      />
                    ) : null}
                    {dream.tone ? (
                      <FieldPill
                        label={t('log.toneLabel')}
                        value={t(`log.tone${capitalize(dream.tone)}`)}
                        valueStyle={{ color: toneColors[dream.tone] }}
                        dotColor={toneColors[dream.tone]}
                      />
                    ) : null}
                    {dream.dreamEnding ? (
                      <FieldPill
                        label={t('log.dreamEndingLabel')}
                        value={t(`log.dreamEnding${capitalize(dream.dreamEnding)}`)}
                      />
                    ) : null}
                    {dream.dreamType.length ? (
                      <FieldPill
                        label={t('log.dreamTypeLabel')}
                        value={dream.dreamType.map(type => t(`dreamType.${type}`)).join(' · ')}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* Who, where — the dreamer's own words, so they carry the solid chip. */}
              {dream.characters.length || dream.places.length ? (
                <View style={styles.contextBlock}>
                  <Text style={styles.contextBlockLabel}>{t('dream.whoWhereLabel')}</Text>
                  <ChipRow>
                    {[...dream.characters, ...dream.places].map((tag, index) => (
                      <Chip key={`${tag}-${index}`} label={tag} variant="entry" />
                    ))}
                  </ChipRow>
                </View>
              ) : null}
            </CollapsibleSection>
          ) : null}

          {hasAiMetadata ? (
            <View style={styles.aiMetadataCard}>
              <View style={styles.aiMetadataHeader}>
                <View style={styles.diamondMark} />
                <Text style={styles.aiMetadataTitle}>{t('dream.aiMetadataTitle')}</Text>
              </View>

              {interpretation?.archetype ? (
                <View style={styles.archetypeRow}>
                  <Text style={styles.archetypeName}>{interpretation.archetype}</Text>
                  <Text style={styles.archetypeCaption}>{t('dream.archetypeLabel')}</Text>
                </View>
              ) : null}

              {interpretation?.themes.length ? (
                <ChipRow>
                  {interpretation.themes.map(theme => (
                    <Chip key={theme} label={theme} variant="keyword" style={styles.dashedChip} />
                  ))}
                </ChipRow>
              ) : null}

              {interpretation?.symbolicDensity ? (
                <View style={styles.densityRow}>
                  <ClarityDots
                    value={interpretation.symbolicDensity}
                    max={4}
                    size={6}
                    shape="diamond"
                    accessibilityLabel={t('a11y.symbolicDensityValue', {
                      value: interpretation.symbolicDensity,
                      max: 4,
                    })}
                  />
                  <Text style={styles.densityLabel}>
                    {t('dream.symbolicDensityLabel')} · {interpretation.symbolicDensity}/4
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {interpretation?.culturalReferences.length ? (
            <View style={styles.culturalCard}>
              <Text style={styles.culturalTitle}>{t('dream.culturalReferences')}</Text>
              {interpretation.culturalReferences.map((ref, index) => (
                <View key={`${ref.symbol}-${index}`} style={styles.culturalRow}>
                  <View style={styles.culturalIcon}>
                    <SymbolIcon />
                  </View>
                  <View style={styles.culturalRowText}>
                    <Text style={styles.culturalRowTitle}>
                      {ref.symbol} · {ref.tradition}
                    </Text>
                    <Text style={styles.culturalRowMeaning}>{ref.meaning}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {monthlyTheme && monthlyThemeHeader ? (
            <View style={styles.relatedCard}>
              <View style={styles.relatedHeader}>
                <Text style={styles.relatedTitle}>{monthlyThemeHeader}</Text>
                <Pressable onPress={() => router.push('/(main)/insights')}>
                  <Text style={styles.relatedLink}>{t('dream.seeConstellation')} →</Text>
                </Pressable>
              </View>
              {monthlyTheme.dreamsThisMonth.map((d, index) => (
                <DreamListRow
                  key={d.id}
                  title={d.title}
                  occurredAt={d.occurredAt}
                  isCurrent={d.id === dream.id}
                  showConnector={index < monthlyTheme.dreamsThisMonth.length - 1}
                  onPress={() => router.push(`/(main)/journal/${d.id}/detail`)}
                />
              ))}
            </View>
          ) : null}

          {chainDreams.length ? (
            <View style={styles.relatedCard}>
              <View style={styles.relatedHeader}>
                <Text style={styles.relatedTitle}>{t('dream.relatedDreamsTitle')}</Text>
                <Pressable onPress={() => router.push('/(main)/insights')}>
                  <Text style={styles.relatedLink}>{t('dream.seeConstellation')} →</Text>
                </Pressable>
              </View>
              {chainDreams.map((linked, index) => (
                <DreamListRow
                  key={linked.id}
                  title={linked.title}
                  occurredAt={linked.occurredAt}
                  isCurrent={false}
                  showConnector={index < chainDreams.length - 1}
                  onPress={() => router.push(`/(main)/journal/${linked.id}/detail`)}
                />
              ))}
            </View>
          ) : null}

          {/* The "Edit dream" affordance from the design is intentionally absent: the
            log screen does not yet accept an editId, so the button led nowhere.
            Tracked as the FR-031 edit-flow ticket. */}
          <Button
            label={t('dream.delete')}
            variant="ghost"
            onPress={handleDelete}
            style={styles.delete}
          />
        </View>
      </ScrollView>

      <Modal
        visible={isFullscreenOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenOpen(false)}
      >
        <View style={styles.fullscreenOverlay}>
          {heroUri ? (
            <Image
              source={{ uri: heroUri }}
              style={styles.fullscreenImage}
              contentFit="contain"
              accessibilityIgnoresInvertColors
              accessibilityLabel={t('dream.imageIllustrationLabel')}
            />
          ) : null}
          <Pressable
            onPress={() => setFullscreenOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={[styles.fullscreenClose, { top: insets.top + spacing.sm }]}
          >
            <CloseIcon size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/**
 * One inset box in the "The night" strip — a muted label over a monospace value.
 * Bedtime, wake time and duration all share it so their digits line up column to
 * column instead of drifting with proportional figures.
 */
function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

/**
 * A 1–5 rating read back as the dreamer set it: the label, the five dots, then the
 * fraction. The number matters — the dots alone leave a screenshot ambiguous and put
 * the whole datum on colour, which the design system forbids.
 */
function ScaleRow({
  label,
  value,
  accessibilityLabel,
}: {
  label: string;
  value: number;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.scaleRow}>
      <Text style={styles.scaleLabel}>{label}</Text>
      <ClarityDots value={value} size={10} accessibilityLabel={accessibilityLabel} />
      <Text style={styles.scaleValue}>{value}/5</Text>
    </View>
  );
}

/**
 * A single enumerated field, read back as "label · value" in one pill. Used for
 * lucidity, tone, ending and type — the four fields that are a choice rather than a
 * scale, and which previously reached the screen as a colour dot or not at all.
 */
function FieldPill({
  label,
  value,
  valueStyle,
  dotColor,
}: {
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
  dotColor?: string;
}) {
  return (
    <View style={styles.fieldPill}>
      <Text style={styles.fieldPillLabel}>{label}</Text>
      {dotColor ? <View style={[styles.fieldPillDot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.fieldPillValue, valueStyle]}>{value}</Text>
    </View>
  );
}

/** Stands in as a headline until interpretations carry a generated title. */
interface DreamListRowProps {
  title: string;
  occurredAt: string;
  /** True for the dream currently being viewed — lit up, labelled "this dream" instead
   * of a date, and not pressable (there's nowhere to navigate to). */
  isCurrent: boolean;
  /** False on the last row — suppresses the connecting line beneath it. */
  showConnector: boolean;
  onPress: () => void;
}

/**
 * One row of a dream list (the manually-linked chain, or the AI theme-recurrence
 * list below it) — a dot, an optional connecting line to the next row, a title and a
 * date/"this dream" label. Colocated here rather than promoted to shared/components:
 * both call sites are this screen's own two lists, and nothing else needs it yet.
 */
function DreamListRow({ title, occurredAt, isCurrent, showConnector, onPress }: DreamListRowProps) {
  const { t, i18n } = useTranslation();
  const dateLabel = new Date(occurredAt).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
  });

  const row = (
    <View style={styles.listRow}>
      <View style={styles.listRowMarker}>
        <View style={[styles.listRowDot, isCurrent && styles.listRowDotCurrent]} />
        {showConnector ? <View style={styles.listRowConnector} /> : null}
      </View>
      <View style={styles.relatedRowText}>
        <Text style={styles.relatedRowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.relatedRowDate}>{isCurrent ? t('dream.thisDream') : dateLabel}</Text>
      </View>
    </View>
  );

  if (isCurrent) return row;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('journal.openDream', { title })}
    >
      {row}
    </Pressable>
  );
}

function firstLine(description: string): string {
  const sentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return sentence.length > 70 ? `${sentence.slice(0, 67).trimEnd()}…` : sentence;
}

/** `positive` → `Positive`, matching the `log.tone{Positive,Negative,…}` key shape. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: colors.surfaceElevated,
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    ...typography.meta,
    fontSize: 10.5,
    letterSpacing: 0.6,
  },
  heroButton: {
    position: 'absolute',
    left: spacing.md,
    width: sizes.circleButton,
    height: sizes.circleButton,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlyph: {
    ...typography.cardTitle,
    fontSize: 18,
    lineHeight: 20,
  },
  sheet: {
    marginTop: -CONTENT_OVERLAP,
    paddingHorizontal: 18,
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  meta: {
    ...typography.meta,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  lucidDot: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.highlight,
  },
  lucidLabel: {
    ...typography.chip,
    color: colors.highlight,
  },
  toneDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  title: {
    ...typography.dreamTitle,
    fontSize: 27,
    lineHeight: 33,
  },
  narrative: {
    ...typography.dreamBody,
    fontSize: 15.5,
    lineHeight: 26,
  },
  interpretationCard: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.borderMystic,
    padding: 18,
    gap: 12,
  },
  interpretationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  interpretationBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  interpretationMark: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  interpretationTitle: {
    ...typography.cardTitle,
    fontSize: 14,
  },
  interpretationBody: {
    ...typography.interpretationBody,
  },
  degraded: {
    ...typography.meta,
    color: colors.highlight,
  },
  interpretationActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  flexAction: {
    flex: 1,
  },
  delete: {
    alignSelf: 'center',
  },
  contextBlock: {
    gap: 9,
  },
  contextBlockLabel: {
    ...typography.overline,
    fontSize: 10,
    lineHeight: 13,
  },
  contextCaption: {
    ...typography.meta,
    fontSize: 11.5,
    lineHeight: 16,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricBox: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  metricLabel: {
    ...typography.overline,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0,
    textTransform: 'none',
  },
  metricValue: {
    ...typography.metricValue,
  },
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scaleLabel: {
    ...typography.body,
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  scaleValue: {
    ...typography.chip,
    color: colors.accentText,
  },
  fieldPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldPillLabel: {
    ...typography.meta,
    fontSize: 11,
    lineHeight: 15,
  },
  fieldPillValue: {
    ...typography.chip,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  fieldPillLucid: {
    color: colors.highlight,
  },
  fieldPillDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  relatedCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 5,
  },
  relatedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  relatedTitle: {
    ...typography.overline,
    fontSize: 10.5,
  },
  relatedLink: {
    ...typography.chip,
    color: colors.accentText,
  },
  listRow: {
    flexDirection: 'row',
    gap: spacing.sm + 3,
  },
  listRowMarker: {
    width: 14,
    alignItems: 'center',
  },
  listRowDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.borderElevated,
  },
  listRowDotCurrent: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.accentText,
    ...glow.highlight,
    shadowColor: colors.accentText,
  },
  listRowConnector: {
    width: 1,
    flex: 1,
    minHeight: 13,
    marginTop: 2,
    backgroundColor: colors.borderElevated,
  },
  relatedRowText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
    paddingBottom: spacing.sm + 3,
  },
  relatedRowTitle: {
    ...typography.dreamTitle,
    fontSize: 14.5,
    lineHeight: 19,
  },
  relatedRowDate: {
    ...typography.meta,
    fontSize: 11.5,
  },
  aiMetadataCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderElevated,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  aiMetadataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  diamondMark: {
    width: 5,
    height: 5,
    backgroundColor: colors.accentText,
    transform: [{ rotate: '45deg' }],
  },
  aiMetadataTitle: {
    ...typography.overline,
    fontSize: 10.5,
    color: colors.accentText,
  },
  archetypeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm + 1,
  },
  archetypeName: {
    ...typography.dreamTitle,
    fontSize: 19,
  },
  archetypeCaption: {
    ...typography.meta,
    fontSize: 12,
  },
  dashedChip: {
    backgroundColor: colors.transparent,
    borderStyle: 'dashed',
    borderColor: colors.accent,
  },
  densityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 1,
    paddingTop: 2,
  },
  densityLabel: {
    ...typography.meta,
    fontSize: 12,
  },
  culturalCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  culturalTitle: {
    ...typography.overline,
    fontSize: 10.5,
  },
  culturalRow: {
    flexDirection: 'row',
    gap: spacing.sm + 3,
  },
  culturalIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderMystic,
    alignItems: 'center',
    justifyContent: 'center',
  },
  culturalRowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  culturalRowTitle: {
    ...typography.cardTitle,
    fontSize: 13.5,
  },
  culturalRowMeaning: {
    ...typography.meta,
    fontSize: 12.5,
    lineHeight: 18,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenClose: {
    position: 'absolute',
    right: spacing.md,
    width: sizes.circleButton,
    height: sizes.circleButton,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
