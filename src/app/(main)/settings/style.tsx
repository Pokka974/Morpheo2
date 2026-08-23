import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../supabase/client';
import { colors, radius, spacing, typography } from '@theme/tokens';

type Style = 'symbolic' | 'mythological' | 'psychological';

const STYLE_KEYS: Record<Style, { label: string; desc: string }> = {
  symbolic: { label: 'settingsStyle.symbolicLabel', desc: 'settingsStyle.symbolicDesc' },
  mythological: {
    label: 'settingsStyle.mythologicalLabel',
    desc: 'settingsStyle.mythologicalDesc',
  },
  psychological: {
    label: 'settingsStyle.psychologicalLabel',
    desc: 'settingsStyle.psychologicalDesc',
  },
};

const STYLE_ORDER: Style[] = ['symbolic', 'mythological', 'psychological'];

export default function StyleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Style>('symbolic');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('interpretation_style')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Failed to load interpretation style:', error);
        return;
      }
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
        const { error } = await supabase
          .from('profiles')
          .update({ interpretation_style: style })
          .eq('id', user.id);
        if (error) console.error('Failed to save interpretation style:', error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <Text style={styles.title}>{t('settingsStyle.title')}</Text>
      <Text style={styles.subtitle}>{t('settingsStyle.subtitle')}</Text>

      {STYLE_ORDER.map(value => {
        const isSelected = selected === value;
        return (
          <Pressable
            key={value}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => {
              void handleSelect(value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <View style={styles.optionHeader}>
              <View style={[styles.radio, isSelected && styles.radioSelected]} />
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {t(STYLE_KEYS[value].label)}
              </Text>
            </View>
            <Text style={styles.optionDesc}>{t(STYLE_KEYS[value].desc)}</Text>
          </Pressable>
        );
      })}

      {isSaving && (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.savingText}>{t('settingsStyle.saving')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
  title: { ...typography.screenTitle, fontSize: 22 },
  subtitle: { ...typography.meta },
  option: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
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
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  optionLabel: { ...typography.body, color: colors.textSecondary, flex: 1 },
  optionLabelSelected: { color: colors.textPrimary, fontFamily: typography.cardTitle.fontFamily },
  optionDesc: { ...typography.meta, marginLeft: 28 },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  savingText: { ...typography.meta },
});
