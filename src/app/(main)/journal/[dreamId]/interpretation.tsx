import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { LoadingState } from '@shared/components/LoadingState';
import { ErrorState } from '@shared/components/ErrorState';
import { EmptyState } from '@shared/components/EmptyState';
import { LockIcon } from '@shared/components/icons';
import { InterpretationResultView } from '@features/interpretation/InterpretationResultView';
import { ConsentPromptModal } from '@features/auth/ConsentPromptModal';
import { useInterpretation } from '@features/interpretation/useInterpretation';
import { recordRecurrence } from '@features/recurrence/recurrenceRepository';
import { useServices } from '@services/useServices';
import { colors } from '@theme/tokens';

/**
 * Fires the interpretation request as soon as this screen mounts — no second
 * "Interpret" button. The only manual action in this flow is the one press on the
 * dream detail screen that navigated here; this screen exists to show loading,
 * result, and failure states, not to ask the user to confirm the same thing twice.
 */
export default function InterpretationScreen() {
  const { dreamId, description } = useLocalSearchParams<{ dreamId: string; description: string }>();
  const { t } = useTranslation();
  const { state, interpret, retry } = useInterpretation();
  const { entitlement } = useServices();
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);
  const firedRef = useRef(false);

  const handleInterpret = () => {
    void interpret({ dreamId, description, style: 'symbolic' });
  };

  // Runs exactly once on mount, deliberately: handleInterpret is recreated every
  // render from the same dreamId/description route params, and firedRef guards
  // against StrictMode's double-invoke, so an empty dependency array is correct here
  // rather than a lint workaround.
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    handleInterpret();
  }, []);

  useEffect(() => {
    if (state.status === 'consent_required') setShowConsent(true);
  }, [state.status]);

  // The Edge Function writes the interpretation to Postgres only — nothing
  // pulls it back down to local SQLite, which is what dream detail reads
  // from. Persist it here so navigating back shows it (and triggers image
  // generation) instead of leaving the dream permanently "uninterpreted"
  // on-device.
  useEffect(() => {
    if (state.status !== 'success' && state.status !== 'degraded') return;
    const result = state.result;
    void db
      .runAsync(
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
      )
      .then(async () => {
        const dreamRow = await db.getFirstAsync<{ user_id: string }>(
          `SELECT user_id FROM dreams WHERE id = ?`,
          [dreamId]
        );
        if (dreamRow) {
          await recordRecurrence(dreamRow.user_id, dreamId, 'keyword', result.keywords);
          await recordRecurrence(dreamRow.user_id, dreamId, 'emotion', result.emotions);
        }
        router.replace(`/(main)/journal/${dreamId}/detail`);
      });
  }, [state, dreamId, router]);

  const handleRetry = () => {
    retry({ dreamId, description, style: 'symbolic' });
  };

  return (
    <View style={styles.container}>
      {state.status === 'idle' || state.status === 'loading' ? (
        <LoadingState message={t('dream.interpreting')} />
      ) : state.status === 'success' || state.status === 'degraded' ? (
        <InterpretationResultView result={state.result} />
      ) : state.status === 'error' ? (
        <ErrorState
          message={t('dream.interpretationUnavailableBody')}
          title={t('dream.interpretationUnavailableTitle')}
          onRetry={handleRetry}
        />
      ) : state.status === 'limit_exceeded' ? (
        <EmptyState
          icon={<LockIcon />}
          title={t('dream.limitReachedTitle')}
          subtitle={t('dream.limitReachedBody', {
            date: state.resetDate.toLocaleDateString(),
          })}
          ctaLabel={t('insights.upgradeCta')}
          onCta={() => {
            void entitlement.purchasePremium();
          }}
        />
      ) : state.status === 'paywall' ? (
        <EmptyState
          icon={<LockIcon />}
          title={t('dream.paywallTitle')}
          subtitle={t('dream.paywallBody')}
          ctaLabel={t('insights.upgradeCta')}
          onCta={() => {
            void entitlement.purchasePremium();
          }}
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
    backgroundColor: colors.background,
  },
});
