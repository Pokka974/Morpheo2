import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChevronRightIcon } from '@shared/components/icons';
import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  title: string;
  /** Shown next to the title when collapsed and non-empty — a quick "what's set" hint. */
  summary?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  testID?: string;
}

/**
 * A card section that starts collapsed. The redesigned log screen groups its new
 * metadata into several of these (Sommeil, Le rêve lui-même, Qui/où, Contexte
 * personnel) so the narrative textarea stays the visual centre of the screen and
 * the extra fields read as optional detail, not a form to fill in before saving.
 */
export function CollapsibleSection({
  title,
  summary,
  children,
  defaultExpanded = false,
  testID,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.card} testID={testID}>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {!expanded && summary ? (
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <ChevronRightIcon size={13} />
        </View>
      </Pressable>

      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.cardTitle,
    fontSize: 14,
  },
  summary: {
    ...typography.meta,
    fontSize: 12,
  },
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.sm + 4,
  },
});
