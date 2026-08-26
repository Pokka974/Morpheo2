import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { ClarityDots } from '@shared/components/ClarityDots';
import { Chip, ChipRow } from '@shared/components/Chip';
import type { Tone } from '@features/dream-log/dreamMetadata';
import { colors, glow, gradients, radius, sizes, spacing, toneColors, typography } from '@theme/tokens';

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
  /** Overall tone — renders as a small coloured dot next to the lucid marker. */
  tone?: Tone | null;
  /** 1–5. Renders as five small dots, trailing the card's bottom row. */
  clarity?: number | null;
  /** Type tags the dreamer attached at log time — only `nightmare` earns a badge; an
   * ordinary dream shows none, which is itself the design's default state. */
  dreamType?: string[];
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

/** `positive` → `Positive`, matching the `log.tone{Positive,Negative,…}` key shape. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

  const isNightmare = entry.dreamType?.includes('nightmare') ?? false;

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
          <View style={styles.compactMetaRow}>
            <Text style={isPending ? styles.metaAccent : styles.meta} numberOfLines={1}>
              {isPending
                ? t('journal.syncing')
                : entry.hasInterpretation
                  ? t('journal.interpretationReady')
                  : dateLabel}
            </Text>
            {!isPending && entry.tone ? (
              <View
                style={[styles.toneDot, { backgroundColor: toneColors[entry.tone] }]}
                accessibilityLabel={t('a11y.toneIndicator', { tone: t(`log.tone${capitalize(entry.tone)}`) })}
              />
            ) : null}
            {!isPending && isNightmare ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeLabel}>{t('dreamType.nightmare')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.compactTitle} numberOfLines={2}>
            {title}
          </Text>
          {entry.emotions?.[0] ? (
            <Chip label={entry.emotions[0]} style={styles.compactChip} />
          ) : null}
        </View>
        {!isPending && entry.clarity ? (
          <ClarityDots
            value={entry.clarity}
            accessibilityLabel={t('a11y.clarityValue', { value: entry.clarity, max: 5 })}
          />
        ) : null}
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
          {entry.tone ? (
            <View
              style={[
                styles.toneDot,
                styles.toneDotGlow,
                { backgroundColor: toneColors[entry.tone], shadowColor: toneColors[entry.tone] },
              ]}
              accessibilityLabel={t('a11y.toneIndicator', { tone: t(`log.tone${capitalize(entry.tone)}`) })}
            />
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

        {entry.emotions?.length || entry.clarity ? (
          <View style={styles.signalsRow}>
            {entry.emotions?.length ? (
              <ChipRow style={styles.signalsChips}>
                {entry.emotions.slice(0, 3).map(emotion => (
                  <Chip key={emotion} label={emotion} />
                ))}
              </ChipRow>
            ) : (
              <View style={styles.signalsChips} />
            )}
            {entry.clarity ? (
              <ClarityDots
                value={entry.clarity}
                accessibilityLabel={t('a11y.clarityValue', { value: entry.clarity, max: 5 })}
                style={styles.fullClarity}
              />
            ) : null}
          </View>
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
  toneDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  toneDotGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 3,
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
  signalsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm + 2,
  },
  signalsChips: {
    flex: 1,
  },
  fullClarity: {
    paddingBottom: 8,
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
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  compactTitle: {
    ...typography.dreamTitle,
    fontSize: 17,
    lineHeight: 22,
  },
  compactChip: {
    marginTop: 2,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.chip,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  typeBadgeLabel: {
    ...typography.overline,
    fontSize: 10,
    lineHeight: 13,
    color: colors.error,
  },
  pressed: {
    opacity: 0.85,
  },
});
