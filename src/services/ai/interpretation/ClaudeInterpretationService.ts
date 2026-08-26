import { supabase } from '../../../supabase/client';
import type {
  CulturalReference,
  InterpretationService,
  InterpretationRequest,
  InterpretationResult,
} from './InterpretationService';
import {
  InterpretationLimitError,
  ConsentRequiredError,
  InterpretationProviderError,
} from './InterpretationService';

export class ClaudeInterpretationService implements InterpretationService {
  async interpret(request: InterpretationRequest): Promise<InterpretationResult> {
    const response = (await supabase.functions.invoke<unknown>('interpret', {
      body: request,
    })) as { data: unknown; error: unknown };
    const { data, error } = response;

    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 403) throw new ConsentRequiredError();
      if (status === 429) {
        const resetDate = new Date(
          (data as { resetDate?: string })?.resetDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000
        );
        throw new InterpretationLimitError(resetDate);
      }
      if (status === 503 || status === 500) throw new InterpretationProviderError(true);
      throw new InterpretationProviderError(false);
    }

    const result = data as InterpretationResult;
    return result;
  }

  async getInterpretation(dreamId: string): Promise<InterpretationResult | null> {
    const response = (await supabase
      .from('interpretations')
      .select('*')
      .eq('dream_id', dreamId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as { data: unknown; error: unknown };
    const { data, error } = response;

    if (error || !data) return null;
    const row = data as Record<string, unknown>;

    return {
      id: row['id'] as string,
      dreamId: row['dream_id'] as string,
      overallReading: row['overall_reading'] as string,
      keywords: (row['keywords'] as string[] | null) ?? [],
      emotions: (row['emotions'] as string[] | null) ?? [],
      culturalReferences: (row['cultural_references'] as CulturalReference[] | null) ?? [],
      confidence: row['confidence'] as InterpretationResult['confidence'],
      isDegraded: row['is_degraded'] as boolean,
      promptVersion: row['prompt_version'] as string,
      modelUsed: row['model_used'] as string,
      createdAt: row['created_at'] as string,
      archetype: (row['archetype'] as string | null) ?? null,
      themes: (row['themes'] as string[] | null) ?? [],
      symbolicDensity: (row['symbolic_density'] as number | null) ?? null,
      imagePrompt: (row['image_prompt'] as string | null) ?? null,
    };
  }
}
