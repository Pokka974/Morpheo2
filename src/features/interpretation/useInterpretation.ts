import { useState, useCallback } from 'react';
import type {
  InterpretationResult,
  InterpretationRequest,
} from '@services/ai/interpretation/InterpretationService';
import {
  InterpretationLimitError,
  ConsentRequiredError,
} from '@services/ai/interpretation/InterpretationService';
import { useServices } from '@services/useServices';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: InterpretationResult }
  | { status: 'degraded'; result: InterpretationResult }
  | { status: 'error'; error: Error }
  | { status: 'limit_exceeded'; resetDate: Date }
  | { status: 'consent_required' }
  | { status: 'paywall' };

export function useInterpretation() {
  const { interpretation, entitlement } = useServices();
  const [state, setState] = useState<State>({ status: 'idle' });

  const interpret = useCallback(
    async (request: InterpretationRequest) => {
      setState({ status: 'loading' });

      // Entitlement pre-check (UX guard; server re-checks as the actual gate)
      try {
        const canInterpret = await entitlement.canInterpret();
        if (!canInterpret) {
          setState({ status: 'paywall' });
          return;
        }
      } catch {
        // If entitlement check fails, attempt the call anyway; server will gate
      }

      try {
        const result = await interpretation.interpret(request);
        if (result.isDegraded) {
          setState({ status: 'degraded', result });
        } else {
          setState({ status: 'success', result });
        }
      } catch (err) {
        if (err instanceof ConsentRequiredError) {
          setState({ status: 'consent_required' });
        } else if (err instanceof InterpretationLimitError) {
          setState({ status: 'limit_exceeded', resetDate: err.resetDate });
        } else {
          setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
        }
      }
    },
    [interpretation, entitlement]
  );

  const retry = useCallback(
    (request: InterpretationRequest) => {
      void interpret(request);
    },
    [interpret]
  );

  return { state, interpret, retry };
}
