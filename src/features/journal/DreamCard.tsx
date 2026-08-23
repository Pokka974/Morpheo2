import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { Chip, ChipRow } from '@shared/components/Chip';
import { colors, glow, gradients, radius, sizes, spacing, typography } from '@theme/tokens';

export interface JournalEntry {
  id: string;
  description: string;
  occurredAt: string;
  syncStatus: 'local' | 'sync_pending' | 'synced' | 'sync_failed';
  thumbnailUri?: string | null;
  /** Present once an interpretation exists — drives the Fraunces headline. */
  title?: string | null;
  /** Emotions from the interpretation; drives the chip row on the full card. */
  emotions?: string[];
  /** Marks the amber lucid badge. */
  isLucid?: boolean;
  hasInterpretation?: boolean;
}

export type DreamCardVariant = 'full' | 'compact';

interface DreamCardProps {
  entry: JournalEntry;
  /**
   * `full` is the hero card with a generated visual, title, excerpt and emotions.
   * `compact` is the row used further down the journal and in dense lists.
   */
  variant?: DreamCardVariant;
  onPress: (id: string) => void;
}

/** First sentence, or a clipped opening, standing in until a title is generated. */
export function deriveTitle(description: string): string {
  const firstSentence = description.split(/(?<=[.!?])\s/)[0] ?? description;
  return firstSentence.length > 60 ? `${firstSentence.slice(0, 57).trimEnd()}…` : firstSentence;
}

function excerptOf(description: string, limit: number): string {
  return description.length > limit ? `${description.slice(0, limit).trimEnd()}…` : description;
}

export function DreamCard({ entry, variant = 'full', onPress }: DreamCardProps) {
  const { t, i18n } = useTranslation();

  const occurred = new Date(entry.occurredAt);
  const isPending = entry.syncStatus === 'sync_pending' || entry.syncStatus === 'local';
  const title = entry.title?.trim() || deriveTitle(entry.description);
  // Only show an excerpt when it adds something the title has not already said.
  const body = excerptOf(entry.description, 140);
  const excerpt = body === title ? '' : body;

  const dateLabel = occurred.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = occurred.toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (variant === 'compact') {
    return (
      <Pressable
        onPress={() => onPress(entry.id)}
        accessibilityRole="button"
        accessibilityLabel={t('journal.openDream', { title })}
        style={({ pressed }) => [
          styles.compactCard,
          isPending && styles.pendingCard,
          entry.hasInterpretation && styles.readyCard,
          pressed && styles.pressed,
        ]}
      >
        {isPending ? (
          <View style={styles.compactThumbPending}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : entry.thumbnailUri ? (
          <Image
            source={{ uri: entry.thumbnailUri }}
            style={styles.compactThumb}
            contentFit="cover"
            transition={300}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.compactThumbEmpty} />
        )}

        <View style={styles.compactBody}>
          <Text style={isPending ? styles.metaAccent : styles.meta} numberOfLines={1}>
            {isPending
              ? t('journal.syncing')
              : entry.hasInterpretation
                ? t('journal.interpretationReady')
                : dateLabel}
          </Text>
          <Text style={styles.compactTitle} numberOfLines={2}>
            {title}
          </Text>
          {entry.emotions?.[0] ? (
            <Chip label={entry.emotions[0]} style={styles.compactChip} />
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(entry.id)}
      accessibilityRole="button"
      accessibilityLabel={t('journal.openDream', { title })}
      style={({ pressed }) => [styles.fullCard, pressed && styles.pressed]}
    >
      <View style={styles.visual}>
        {entry.thumbnailUri ? (
          <Image
            source={{ uri: entry.thumbnailUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={300}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.visualPlaceholder}>{t('journal.generatedVisual')}</Text>
        )}
        <LinearGradient
          colors={[...gradients.imageScrim.colors]}
          locations={[...gradients.imageScrim.locations]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={styles.fullBody}>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {dateLabel} · {timeLabel}
          </Text>
          {entry.isLucid ? (
            <>
              <View style={styles.lucidDot} />
              <Text style={styles.lucidLabel}>{t('journal.lucid')}</Text>
            </>
          ) : null}
        </View>

        <Text style={styles.fullTitle} numberOfLines={2}>
          {title}
        </Text>
        {/* A one-sentence dream is entirely consumed by the title; repeating it as an
            excerpt would render the same line twice. */}
        {excerpt ? (
          <Text style={styles.excerpt} numberOfLines={3}>
            {excerpt}
          </Text>
        ) : null}

        {entry.emotions?.length ? (
          <ChipRow>
            {entry.emotions.slice(0, 3).map(emotion => (
              <Chip key={emotion} label={emotion} />
            ))}
          </ChipRow>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fullCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  visual: {
    height: 132,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualPlaceholder: {
    ...typography.meta,
    fontSize: 10.5,
    letterSpacing: 0.6,
  },
  fullBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  meta: {
    ...typography.meta,
    fontSize: 12,
  },
  metaAccent: {
    ...typography.meta,
    fontSize: 12,
    color: colors.accentText,
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
  fullTitle: {
    ...typography.dreamTitle,
    fontSize: 20,
    lineHeight: 25,
  },
  excerpt: {
    ...typography.dreamBody,
    fontSize: 14,
    lineHeight: 22,
  },

  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingCard: {
    borderStyle: 'dashed',
    borderColor: colors.borderElevated,
  },
  readyCard: {
    borderColor: colors.borderMystic,
    ...glow.soft,
  },
  compactThumb: {
    width: sizes.thumbSmall,
    height: sizes.thumbSmall,
    borderRadius: radius.thumb,
  },
  compactThumbEmpty: {
    width: sizes.thumbSmall,
    height: sizes.thumbSmall,
    borderRadius: radius.thumb,
    backgroundColor: colors.surfaceElevated,
  },
  compactThumbPending: {
    width: sizes.thumbSmall,
    height: sizes.thumbSmall,
    borderRadius: radius.thumb,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBody: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  compactTitle: {
    ...typography.dreamTitle,
    fontSize: 17,
    lineHeight: 22,
  },
  compactChip: {
    marginTop: 2,
  },
  pressed: {
    opacity: 0.85,
  },
});
