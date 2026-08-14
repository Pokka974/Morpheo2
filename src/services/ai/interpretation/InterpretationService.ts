export interface CulturalReference {
  symbol: string;
  tradition: string;
  meaning: string;
}

export interface InterpretationResult {
  id: string;
  dreamId: string;
  overallReading: string;
  keywords: string[];
  emotions: string[];
  culturalReferences: CulturalReference[];
  confidence: 'high' | 'medium' | 'low';
  isDegraded: boolean;
  promptVersion: string;
  modelUsed: string;
  createdAt: string;
}

export interface InterpretationRequest {
  dreamId: string;
  description: string;
  style: 'symbolic' | 'mythological' | 'psychological';
  languageHint?: string;
}

export interface InterpretationService {
  interpret(request: InterpretationRequest): Promise<InterpretationResult>;
  getInterpretation(dreamId: string): Promise<InterpretationResult | null>;
}

export class InterpretationLimitError extends Error {
  constructor(public readonly resetDate: Date) {
    super('Monthly interpretation limit reached');
    this.name = 'InterpretationLimitError';
  }
}

export class ConsentRequiredError extends Error {
  constructor() {
    super('AI consent must be granted before interpretation');
    this.name = 'ConsentRequiredError';
  }
}

export class InterpretationProviderError extends Error {
  constructor(public readonly retryable: boolean) {
    super('AI provider unavailable');
    this.name = 'InterpretationProviderError';
  }
}
