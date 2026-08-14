import React from 'react';
import { ActivityIndicator, StyleSheet, View, Text } from 'react-native';
import { spacing } from '../tokens/spacing';
import { fontSize } from '../tokens/typography';

interface Props {
  message?: string;
}

export function LoadingState({ message }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#7c5cbf" />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  message: {
    fontSize: fontSize.md,
    color: '#6b6882',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
