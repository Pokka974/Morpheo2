import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { ErrorState } from '@shared/components/ErrorState';
import { EmptyState } from '@shared/components/EmptyState';
import { InterpretationResultView } from '@features/interpretation/InterpretationResultView';
import { ConsentPromptModal } from '@features/auth/ConsentPromptModal';
import { useInterpretation } from '@features/interpretation/useInterpretation';
import { useServices } from '@services/useServices';

export default function InterpretationScreen() {
  const { dreamId, description } = useLocalSearchParams<{ dreamId: string; description: string }>();
  const { state, interpret, retry } = useInterpretation();
  const { entitlement } = useServices();
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (state.status === 'consent_required') setShowConsent(true);
    if (state.status === 'paywall' || state.status === 'limit_exceeded') setShowPaywall(true);
  }, [state.status]);

  // The Edge Function writes the interpretation to Postgres only — nothing
  // pulls it back down to local SQLite, which is what dream detail reads
  // from. Persist it here so navigating back shows it (and triggers image
  // generation) instead of leaving the dream permanently "uninterpreted"
  // on-device.
  useEffect(() => {
    if (state.status !== 'success' && state.status !== 'degraded') return;
    const result = state.result;
    db.runAsync(
      `INSERT OR REPLACE INTO interpretations
        (id, dream_id, overall_reading, keywords, emotions, cultural_references, confidence, is_degraded, prompt_version, model_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.id,
        dreamId,
        result.overallReading,
        JSON.stringify(result.keywords),
        JSON.stringify(result.emotions),
        JSON.stringify(result.culturalReferences),
        result.confidence,
        result.isDegraded ? 1 : 0,
        result.promptVersion,
        result.modelUsed,
        result.createdAt,
      ]
    ).then(() => {
      router.replace(`/(main)/journal/${dreamId}/detail`);
    });
  }, [state, dreamId, router]);

  const handleInterpret = () => {
    interpret({ dreamId, description, style: 'symbolic' });
  };

  const handleRetry = () => {
    retry({ dreamId, description, style: 'symbolic' });
  };

  return (
    <View style={styles.container}>
      {state.status === 'idle' ? (
        <EmptyState
          icon="🌙"
          title="Ready to interpret"
          subtitle="Tap below to receive an AI interpretation of this dream."
          ctaLabel="Interpret Dream"
          onCta={handleInterpret}
        />
      ) : state.status === 'loading' ? (
        <LoadingState message="Interpreting your dream..." />
      ) : state.status === 'success' || state.status === 'degraded' ? (
        <InterpretationResultView result={state.result} />
      ) : state.status === 'error' ? (
        <ErrorState
          message="The interpretation service is temporarily unavailable."
          onRetry={handleRetry}
          retryLabel="Try Again"
        />
      ) : state.status === 'limit_exceeded' ? (
        <EmptyState
          icon="🔒"
          title="Monthly limit reached"
          subtitle={`Your free interpretations reset on ${state.resetDate.toLocaleDateString()}.`}
          ctaLabel="Upgrade to Premium"
          onCta={() => entitlement.purchasePremium()}
        />
      ) : state.status === 'paywall' ? (
        <EmptyState
          icon="⭐"
          title="Upgrade required"
          subtitle="Unlimited interpretations are available with a premium subscription."
          ctaLabel="View Premium Plans"
          onCta={() => entitlement.purchasePremium()}
        />
      ) : null}

      <ConsentPromptModal
        visible={showConsent}
        onGranted={() => {
          setShowConsent(false);
          handleInterpret();
        }}
        onDismiss={() => setShowConsent(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
});
