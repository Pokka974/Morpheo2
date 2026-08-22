import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { ErrorState } from '@shared/components/ErrorState';
import { InterpretationResultView } from '@features/interpretation/InterpretationResultView';
import { DreamMediaView } from '@features/media-generation/DreamMediaView';
import { useImageGeneration } from '@features/media-generation/useImageGeneration';
import { useVideoGeneration } from '@features/media-generation/useVideoGeneration';
import { VideoGenerationButton } from '@features/media-generation/VideoGenerationButton';
import { useServices } from '@services/useServices';
import { spacing } from '@shared/tokens/spacing';
import { colors } from '@shared/tokens/colors';
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

export default function DreamDetailScreen() {
  const { dreamId } = useLocalSearchParams<{ dreamId: string }>();
  const router = useRouter();
  const { imageGeneration } = useServices();

  const [dream, setDream] = useState<DreamDetail | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretationResult | null>(null);
  const [imageMedia, setImageMedia] = useState<MediaResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      } catch {
        // leave null
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [dreamId, imageGeneration]);

  // Auto-trigger image generation once an interpretation exists and no image
  // has been generated yet (per US5: image auto-generates after interpretation).
  useEffect(() => {
    if (!dream || !interpretation || imageMedia || isLoading) return;
    if (imageState.status !== 'idle') return;
    void generate({
      dreamId: dream.id,
      description: dream.description,
      keywords: interpretation.keywords,
    });
  }, [dream, interpretation, imageMedia, isLoading, imageState.status, generate]);

  const confirmDelete = async () => {
    await db.runAsync(
      "UPDATE dreams SET is_deleted = 1, last_modified_at = datetime('now') WHERE id = ?",
      dreamId
    );
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Dream', 'This will permanently remove this dream entry.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDelete();
        },
      },
    ]);
  };

  if (isLoading) return <LoadingState message="Loading dream..." />;
  if (!dream) return <ErrorState message="Dream not found." />;

  const activeImage = imageState.status === 'success' ? imageState.media : imageMedia;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.date}>
        {new Date(dream.occurredAt).toLocaleDateString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </Text>

      <Text style={styles.description}>{dream.description}</Text>

      <View style={styles.section}>
        {interpretation ? (
          <InterpretationResultView result={interpretation} />
        ) : (
          <TouchableOpacity
            style={styles.interpretButton}
            onPress={() =>
              router.push(
                `/(main)/journal/${dream.id}/interpretation?dreamId=${dream.id}&description=${encodeURIComponent(dream.description)}`
              )
            }
            accessibilityRole="button"
          >
            <Text style={styles.interpretButtonText}>🌙 Get AI Interpretation</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <DreamMediaView
          media={activeImage}
          isGenerating={imageState.status === 'generating'}
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
      </View>

      <View style={styles.section}>
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
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => router.push(`/(main)/log?editId=${dream.id}`)}
          accessibilityRole="button"
        >
          <Text style={styles.editText}>Edit Dream</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  date: { fontSize: 13, color: '#888' },
  description: { fontSize: 16, color: '#ccc', lineHeight: 24 },
  section: { gap: spacing.sm },
  interpretButton: {
    backgroundColor: '#3d2b7a',
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7c5cbf',
  },
  interpretButtonText: { color: '#e0d0ff', fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  editButton: {
    flex: 1,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  editText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  deleteButton: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e05c5c',
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteText: { color: '#e05c5c', fontSize: 15, fontWeight: '600' },
});
