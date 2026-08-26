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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { deleteDream } from '@features/dream-log/dreamRepository';
import { isLucidLevel, type Lucidity, type Tone } from '@features/dream-log/dreamMetadata';
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
import { useVideoGeneration } from '@features/media-generation/useVideoGeneration';
import { VideoGenerationButton } from '@features/media-generation/VideoGenerationButton';
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
  characters: string[];
  places: string[];
  linkedDreamId: string | null;
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

const HERO_HEIGHT = 320;
/** How far the content sheet rides up over the hero image. */
const CONTENT_OVERLAP = 56;

export default function DreamDetailScreen() {
  const { dreamId } = useLocalSearchParams<{ dreamId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { imageGeneration, auth } = useServices();

  const [dream, setDream] = useState<DreamDetail | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [imageMedia, setImageMedia] = useState<MediaResult | null>(null);
  const [chain, setChain] = useState<RecurrenceChain | null>(null);
  const [monthlyTheme, setMonthlyTheme] = useState<MonthlyThemeRecurrence | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreenOpen, setFullscreenOpen] = useState(false);

  const { state: imageState, generate, regenerate } = useImageGeneration();
  const { state: videoState, submit: submitVideo } = useVideoGeneration();

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
          characters: string;
          places: string;
          linked_dream_id: string | null;
        }>(
          `SELECT id, description, occurred_at, emotions, lucidity, tone, clarity,
                  sleep_quality, bedtime, wake_time, dream_ending, characters, places,
                  linked_dream_id
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
          characters: parseStringArray(dreamRow.characters),
          places: parseStringArray(dreamRow.places),
          linkedDreamId: dreamRow.linked_dream_id,
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
        }>(
          'SELECT id, overall_reading, keywords, emotions, cultural_references, confidence, prompt_version, model_used, created_at, archetype, themes, symbolic_density FROM interpretations WHERE dream_id = ? ORDER BY created_at DESC LIMIT 1',
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
  const hasContext =
    dream.clarity != null ||
    hasSleepInfo ||
    dream.sleepQuality != null ||
    dream.dreamEnding != null ||
    dream.characters.length > 0 ||
    dream.places.length > 0;

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
            <CollapsibleSection title={t('dream.contextTitle')} summary={t('dream.contextHint')}>
              {dream.clarity != null || duration != null || dream.sleepQuality != null ? (
                <View style={styles.contextBoxRow}>
                  {dream.clarity != null ? (
                    <View style={styles.contextBox}>
                      <Text style={styles.contextBoxLabel}>{t('log.clarityLabel')}</Text>
                      <ClarityDots
                        value={dream.clarity}
                        size={5}
                        accessibilityLabel={t('a11y.clarityValue', {
                          value: dream.clarity,
                          max: 5,
                        })}
                      />
                    </View>
                  ) : null}
                  {duration != null || dream.sleepQuality != null ? (
                    <View style={styles.contextBox}>
                      <Text style={styles.contextBoxLabel}>{t('log.sectionSleep')}</Text>
                      <Text style={styles.contextBoxValue}>
                        {[
                          duration
                            ? t('dream.sleepDuration', {
                                hours: duration.hours,
                                minutes: duration.minutes,
                              })
                            : null,
                          dream.sleepQuality != null ? `${dream.sleepQuality}/5` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {dream.dreamEnding ? (
                <View style={styles.contextRow}>
                  <Text style={styles.contextRowLabel}>{t('dream.narrativeArcLabel')}</Text>
                  <Chip
                    label={t(`log.dreamEnding${capitalize(dream.dreamEnding)}`)}
                    variant="keyword"
                  />
                </View>
              ) : null}

              {dream.characters.length || dream.places.length ? (
                <View>
                  <Text style={styles.contextRowLabel}>{t('dream.whoWhereLabel')}</Text>
                  <ChipRow>
                    {[...dream.characters, ...dream.places].map((tag, index) => (
                      <Chip key={`${tag}-${index}`} label={tag} variant="keyword" />
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

          <VideoGenerationButton
            state={videoState}
            onSubmit={() => {
              void submitVideo({
                dreamId: dream.id,
                description: dream.description,
                keywords: interpretation?.keywords ?? [],
              });
            }}
            onUpgrade={() => router.push('/(main)/paywall')}
          />

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
  contextBoxRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contextBox: {
    flex: 1,
    padding: spacing.sm + 3,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 5,
  },
  contextBoxLabel: {
    ...typography.overline,
    fontSize: 10,
    lineHeight: 13,
  },
  contextBoxValue: {
    ...typography.cardTitle,
    fontSize: 13,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 1,
  },
  contextRowLabel: {
    ...typography.overline,
    fontSize: 10.5,
    marginBottom: 7,
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
