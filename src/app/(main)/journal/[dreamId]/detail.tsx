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
import { LoadingState } from '@shared/components/LoadingState';
import { ErrorState } from '@shared/components/ErrorState';
import { Button } from '@shared/components/Button';
import { Chip, ChipRow } from '@shared/components/Chip';
import { CloseIcon } from '@shared/components/icons';
import { DreamImageActionBar } from '@features/media-generation/DreamImageActionBar';
import { useImageGeneration } from '@features/media-generation/useImageGeneration';
import { useVideoGeneration } from '@features/media-generation/useVideoGeneration';
import { VideoGenerationButton } from '@features/media-generation/VideoGenerationButton';
import { useServices } from '@services/useServices';
import { colors, gradients, radius, sizes, spacing, typography } from '@theme/tokens';
import type {
  CulturalReference,
  InterpretationResult,
} from '@services/ai/interpretation/InterpretationService';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';

interface DreamDetail {
  id: string;
  description: string;
  occurredAt: string;
}

const HERO_HEIGHT = 320;
/** How far the content sheet rides up over the hero image. */
const CONTENT_OVERLAP = 56;

export default function DreamDetailScreen() {
  const { dreamId } = useLocalSearchParams<{ dreamId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { imageGeneration } = useServices();

  const [dream, setDream] = useState<DreamDetail | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [imageMedia, setImageMedia] = useState<MediaResult | null>(null);
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
        }>(
          'SELECT id, description, occurred_at FROM dreams WHERE id = ? AND is_deleted = 0',
          dreamId
        );
        if (!dreamRow) return;
        setDream({
          id: dreamRow.id,
          description: dreamRow.description,
          occurredAt: dreamRow.occurred_at,
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
        }>(
          'SELECT id, overall_reading, keywords, emotions, cultural_references, confidence, prompt_version, model_used, created_at FROM interpretations WHERE dream_id = ? ORDER BY created_at DESC LIMIT 1',
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
          });
        }

        const media = await imageGeneration.getImage(dreamId);
        setImageMedia(media);
      } catch (err) {
        console.error('Failed to load dream detail:', err);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [dreamId, imageGeneration]);

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
          </View>

          <Text style={styles.title}>{firstLine(dream.description)}</Text>

          {interpretation?.emotions.length ? (
            <ChipRow>
              {interpretation.emotions.slice(0, 3).map(emotion => (
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
function firstLine(description: string): string {
  const sentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return sentence.length > 70 ? `${sentence.slice(0, 67).trimEnd()}…` : sentence;
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
