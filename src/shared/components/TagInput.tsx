import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, spacing, typography } from '@theme/tokens';

interface Props {
  label: string;
  placeholder: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Previously-used values (across every dream) offered as one-tap adds. */
  suggestions?: string[];
  testID?: string;
}

/**
 * Free-form multi-tag entry for "who" and "where" — role-based tags reused across
 * dreams ("ma mère", "un inconnu"), not a contacts picker. Submitting the text field
 * adds a tag; each tag chip removes itself on tap. Suggestions below the field are
 * values already used elsewhere, so a recurring character doesn't have to be retyped.
 */
export function TagInput({ label, placeholder, tags, onChange, suggestions = [], testID }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (!value || tags.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  };

  const removeTag = (value: string) => {
    onChange(tags.filter(tag => tag !== value));
  };

  const unusedSuggestions = suggestions.filter(s => !tags.includes(s));

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.label}>{label}</Text>

      {tags.length > 0 ? (
        <View style={styles.row}>
          {tags.map(tag => (
            <Pressable
              key={tag}
              onPress={() => removeTag(tag)}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.removeTag', { label: tag })}
              style={styles.chip}
            >
              <Text style={styles.chipLabel}>{tag}</Text>
              <Text style={styles.chipRemove}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => addTag(draft)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="done"
        accessibilityLabel={label}
      />

      {unusedSuggestions.length > 0 ? (
        <View style={styles.row}>
          {unusedSuggestions.slice(0, 6).map(suggestion => (
            <Pressable
              key={suggestion}
              onPress={() => addTag(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.addSuggestedTag', { label: suggestion })}
              style={styles.suggestion}
            >
              <Text style={styles.suggestionLabel}>+ {suggestion}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs + 2,
  },
  label: {
    ...typography.overline,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    backgroundColor: colors.chipNeutralFill,
    borderWidth: 1,
    borderColor: colors.chipNeutralBorder,
  },
  chipLabel: {
    ...typography.chip,
    color: colors.textSecondary,
  },
  chipRemove: {
    ...typography.chip,
    color: colors.textMuted,
  },
  input: {
    ...typography.body,
    fontSize: 14,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.chip,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  suggestion: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderElevated,
  },
  suggestionLabel: {
    ...typography.chip,
    color: colors.textMuted,
  },
});
