import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../../supabase/client';
import { colors, spacing } from '@theme/tokens';

type Style = 'symbolic' | 'mythological' | 'psychological';

const STYLES: { value: Style; label: string; description: string }[] = [
  {
    value: 'symbolic',
    label: 'Symbolic / Archetypal',
    description: 'Interprets dream symbols through universal archetypes and collective meaning.',
  },
  {
    value: 'mythological',
    label: 'Mythological / Cultural',
    description: 'Grounds symbols in world mythology, folklore, and cultural traditions.',
  },
  {
    value: 'psychological',
    label: 'Psychological / Jungian',
    description: 'Explores the unconscious through a Jungian psychological lens.',
  },
];

export default function StyleScreen() {
  const [selected, setSelected] = useState<Style>('symbolic');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('interpretation_style')
        .eq('id', user.id)
        .single();
      if (data?.interpretation_style) setSelected(data.interpretation_style as Style);
    });
  }, []);

  const handleSelect = async (style: Style) => {
    setSelected(style);
    setIsSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ interpretation_style: style }).eq('id', user.id);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Interpretation Style</Text>
      <Text style={styles.subtitle}>Affects how your dreams are interpreted by the AI.</Text>

      {STYLES.map(s => (
        <TouchableOpacity
          key={s.value}
          style={[styles.option, selected === s.value && styles.optionSelected]}
          onPress={() => {
            void handleSelect(s.value);
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === s.value }}
        >
          <View style={styles.optionHeader}>
            <View style={[styles.radio, selected === s.value && styles.radioSelected]} />
            <Text style={[styles.optionLabel, selected === s.value && styles.optionLabelSelected]}>
              {s.label}
            </Text>
          </View>
          <Text style={styles.optionDesc}>{s.description}</Text>
        </TouchableOpacity>
      ))}

      {isSaving && (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { fontSize: 18, color: colors.textPrimary, fontWeight: '700' },
  subtitle: { fontSize: 13, color: colors.textMuted },
  option: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: colors.transparent,
  },
  optionSelected: { borderColor: colors.accent },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  optionLabel: { fontSize: 15, color: colors.textSecondary, flex: 1 },
  optionLabelSelected: { color: colors.textPrimary, fontWeight: '600' },
  optionDesc: { fontSize: 12, color: colors.textMuted, marginLeft: 28 },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  savingText: { color: colors.textMuted, fontSize: 13 },
});
