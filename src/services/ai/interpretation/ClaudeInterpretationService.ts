import { supabase } from '../../../supabase/client';
import type { InterpretationService, InterpretationRequest, InterpretationResult } from './InterpretationService';
import { InterpretationLimitError, ConsentRequiredError, InterpretationProviderError } from './InterpretationService';

export class ClaudeInterpretationService implements InterpretationService {
  async interpret(request: InterpretationRequest): Promise<InterpretationResult> {
    const { data, error } = await supabase.functions.invoke('interpret', {
      body: request,
    });

    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 403) throw new ConsentRequiredError();
      if (status === 429) {
        const resetDate = new Date((data as { resetDate?: string })?.resetDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000);
        throw new InterpretationLimitError(resetDate);
      }
      if (status === 503 || status === 500) throw new InterpretationProviderError(true);
      throw new InterpretationProviderError(false);
    }

    const result = data as InterpretationResult;
    return result;
  }

  async getInterpretation(dreamId: string): Promise<InterpretationResult | null> {
    const { data, error } = await supabase
      .from('interpretations')
      .select('*')
      .eq('dream_id', dreamId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      dreamId: data.dream_id,
      overallReading: data.overall_reading,
      keywords: data.keywords ?? [],
      emotions: data.emotions ?? [],
      culturalReferences: data.cultural_references ?? [],
      confidence: data.confidence,
      isDegraded: data.is_degraded,
      promptVersion: data.prompt_version,
      modelUsed: data.model_used,
      createdAt: data.created_at,
    };
  }
}
