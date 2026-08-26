import type {
  InterpretationService,
  InterpretationRequest,
  InterpretationResult,
} from '../InterpretationService';
import {
  InterpretationLimitError,
  ConsentRequiredError,
  InterpretationProviderError,
} from '../InterpretationService';

export type MockMode = 'success' | 'degraded' | 'failure' | 'limit_exceeded' | 'consent_required';

const SUCCESS_RESULT: InterpretationResult = {
  id: 'mock-interp-id',
  dreamId: '',
  overallReading: 'This dream reflects a journey of transformation.',
  keywords: ['water', 'bridge', 'light'],
  emotions: ['curiosity', 'serenity'],
  culturalReferences: [{ symbol: 'water', tradition: 'Jungian', meaning: 'The unconscious mind' }],
  confidence: 'high',
  isDegraded: false,
  promptVersion: '1.0.0',
  modelUsed: 'mock',
  createdAt: new Date().toISOString(),
  archetype: 'The Seeker',
  themes: ['transformation', 'threshold'],
  symbolicDensity: 3,
  imagePrompt:
    'A moonlit staircase spiralling into still water, seen from below, deep indigo shadow and one amber lamp.',
};

export class MockInterpretationService implements InterpretationService {
  private mode: MockMode = 'success';

  configure(mode: MockMode) {
    this.mode = mode;
    return this;
  }

  async interpret(request: InterpretationRequest): Promise<InterpretationResult> {
    switch (this.mode) {
      case 'success':
        return { ...SUCCESS_RESULT, dreamId: request.dreamId };
      case 'degraded':
        return { ...SUCCESS_RESULT, dreamId: request.dreamId, isDegraded: true, confidence: 'low' };
      case 'failure':
        throw new InterpretationProviderError(true);
      case 'limit_exceeded':
        throw new InterpretationLimitError(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      case 'consent_required':
        throw new ConsentRequiredError();
    }
  }

  async getInterpretation(dreamId: string): Promise<InterpretationResult | null> {
    if (this.mode === 'success' || this.mode === 'degraded') {
      return this.interpret({ dreamId, description: '', style: 'symbolic' });
    }
    return null;
  }
}
