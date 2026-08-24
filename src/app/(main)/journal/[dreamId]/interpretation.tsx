import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { sqlite as db } from '@db/client';
import { ErrorState } from '@shared/components/ErrorState';
import { EmptyState } from '@shared/components/EmptyState';
import { LockIcon } from '@shared/components/icons';
import { InterpretationResultView } from '@features/interpretation/InterpretationResultView';
import { InterpretationWaitingView } from '@features/interpretation/InterpretationWaitingView';
import { deriveTitle } from '@features/journal/DreamCard';
import { ConsentPromptModal } from '@features/auth/ConsentPromptModal';
import { useInterpretation } from '@features/interpretation/useInterpretation';
import { recordRecurrence } from '@features/recurrence/recurrenceRepository';
import { DreamNotSyncedError, syncDreamForInterpretation } from '@features/dream-log/syncService';
import { useServices } from '@services/useServices';
import { colors } from '@theme/tokens';

/**
 * The model the interpret Edge Function calls. Shown in the wait screen's footer so
 * the user can see what is reading their dream; it must track
 * `supabase/functions/interpret/index.ts`.
 */
const INTERPRETATION_MODEL = 'claude-sonnet-4-6';

/**
 * Fires the interpretation request as soon as this screen mounts — no second
 * "Interpret" button. The only manual action in this flow is the one press on the
 * dream detail screen that navigated here; this screen exists to show loading,
 * result, and failure states, not to ask the user to confirm the same thing twice.
 *
 * Every route into interpretation converges here — the log screen after saving, both
 * buttons on the dream detail screen, and the retry below — so this is where the dream
 * is made to exist server-side. The Edge Function inserts an `interpretations` row
 * against a FK on `dreams.id`; a dream that is still local-only (logged offline, or
 * queued behind a failed sync) fails that constraint deep inside the function and
 * surfaces to the user as a generic "interpretation unavailable".
 */
export default function InterpretationScreen() {
  const { dreamId, description } = useLocalSearchParams<{ dreamId: string; description: string }>();
  const { t } = useTranslation();
  // `retry` from the hook is skipped deliberately: it re-fires the request alone,
  // which cannot fix the most common reason this screen fails.
  const { state, interpret } = useInterpretation();
  const { entitlement } = useServices();
  const router = useRouter();
  const [showConsent, setShowConsent] = useState(false);
  const [previousDreamCount, setPreviousDreamCount] = useState(0);
  const [isDreamUnsynced, setIsDreamUnsynced] = useState(false);
  const firedRef = useRef(false);

  // The wait screen says the reading is being crossed with the dreams already logged,
  // so the number has to be real. Counting locally keeps it off the critical path —
  // a failure here costs the sentence its number, not the interpretation.
  useEffect(() => {
    void db
      .getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM dreams WHERE is_deleted = 0 AND id != ?`,
        [dreamId]
      )
      .then(row => setPreviousDreamCount(row?.count ?? 0))
      .catch((err: unknown) => {
        console.error('Failed to count previous dreams for the wait screen:', err);
      });
  }, [dreamId]);

  const dreamTitle = description ? deriveTitle(description) : undefined;

  const handleInterpret = () => {
    void (async () => {
      setIsDreamUnsynced(false);
      try {
        await syncDreamForInterpretation(dreamId);
      } catch (err) {
        if (err instanceof DreamNotSyncedError) {
          setIsDreamUnsynced(true);
          return;
        }
        // Anything else (an expired session mid-drain) is not this screen's to
        // classify — let the interpret call run and report it in the usual way.
        console.error('Pre-interpretation sync failed unexpectedly:', err);
      }
      await interpret({ dreamId, description, style: 'symbolic' });
    })();
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

  // Retrying re-runs the sync too: the usual reason a retry succeeds is that the
  // network came back, which is also what was keeping the dream off the server.
  const handleRetry = handleInterpret;

  return (
    <View style={styles.container}>
      {isDreamUnsynced ? (
        <ErrorState
          message={t('dream.dreamNotSyncedBody')}
          title={t('dream.dreamNotSyncedTitle')}
          onRetry={handleRetry}
          fullScreen
        />
      ) : state.status === 'idle' || state.status === 'loading' ? (
        <InterpretationWaitingView
          dreamTitle={dreamTitle}
          previousDreamCount={previousDreamCount}
          modelLabel={INTERPRETATION_MODEL}
          onContinueInBackground={() => router.replace('/(main)/journal')}
          onCancel={() => router.back()}
        />
      ) : state.status === 'success' || state.status === 'degraded' ? (
        <InterpretationResultView result={state.result} />
      ) : state.status === 'error' ? (
        <ErrorState
          message={t('dream.interpretationUnavailableBody')}
          title={t('dream.interpretationUnavailableTitle')}
          onRetry={handleRetry}
          fullScreen
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
