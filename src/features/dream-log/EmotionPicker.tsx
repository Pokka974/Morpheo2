import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, emotionChip, emotionColors, radius, typography } from '@theme/tokens';

/**
 * The ten emotions, in the order the design lays them out: the ones a dreamer reaches
 * for first, not alphabetical. The keys are the same identifiers the AI returns in
 * `interpretations.emotions`, so the journal's emotion filter and chips read the two
 * lists interchangeably.
 */
const EMOTIONS = Object.keys(emotionColors) as Array<keyof typeof emotionColors>;

/** How many chips show before the "+ N" reveal. The design shows four and a counter. */
const COLLAPSED_COUNT = 4;

/**
 * A chip is ~30px tall by design and must not grow — so the remainder of the 44px
 * target is bought back with hit slop rather than by inflating the pill.
 */
const CHIP_HIT_SLOP = { top: 7, bottom: 7, left: 2, right: 2 };

interface Props {
  selected: string[];
  onChange: (selected: string[]) => void;
}

/**
 * Emotions are entered here, not only inferred by the AI afterwards — that is the
 * change this screen makes. Same chip as the Journal's, with an unselected state in
 * the neutral chip so the row reads as a choice rather than as ten live tags.
 */
export function EmotionPicker({ selected, onChange }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Anything already picked stays visible when collapsed, so a selection can never
  // hide behind the "+ N" chip.
  const visible = expanded
    ? EMOTIONS
    : EMOTIONS.filter((key, i) => i < COLLAPSED_COUNT || selected.includes(key));
  const hiddenCount = EMOTIONS.length - visible.length;

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter(e => e !== key) : [...selected, key]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('log.emotionsHeading')}</Text>
      <View style={styles.row}>
        {visible.map(key => {
          const isSelected = selected.includes(key);
          const palette = emotionChip(key);
          const label = t(`emotions.${key}`);
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={t('a11y.emotionChip', { label })}
              hitSlop={CHIP_HIT_SLOP}
              style={[
                styles.chip,
                isSelected
                  ? { backgroundColor: palette.fill, borderColor: palette.border }
                  : styles.chipIdle,
              ]}
            >
              <Text style={[styles.label, { color: isSelected ? palette.text : colors.textMuted }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
        {hiddenCount > 0 ? (
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel={t('log.emotionsMoreA11y', { count: hiddenCount })}
            hitSlop={CHIP_HIT_SLOP}
            style={[styles.chip, styles.chipIdle]}
          >
            <Text style={[styles.label, styles.labelMuted]}>
              {t('log.emotionsMore', { count: hiddenCount })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  heading: {
    ...typography.overline,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: colors.chipNeutralFill,
    borderColor: colors.chipNeutralBorder,
  },
  label: {
    ...typography.chip,
    fontSize: 13,
  },
  labelMuted: {
    color: colors.textMuted,
  },
});
