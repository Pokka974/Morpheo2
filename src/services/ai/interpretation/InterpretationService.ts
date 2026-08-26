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
  /** The dominant Jungian/narrative archetype Claude identified for this dream. */
  archetype: string | null;
  /** AI-identified recurring themes — distinct from the literal `keywords`. */
  themes: string[];
  /** 1 (literal, few symbols) to 4 (highly symbolic, densely layered). */
  symbolicDensity: number | null;
}

/** Dream metadata passed through so the Edge Function's reading — tone, archetype,
 * themes — can be informed by more than the raw narrative text alone. */
export interface InterpretationRequestMetadata {
  tone?: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
  lucidity?: 'none' | 'semi' | 'lucid' | 'full';
  clarity?: number | null;
  /** How the dream resolved — a narrative-shape signal the archetype reading depends on. */
  dreamEnding?: 'resolved' | 'unresolved' | 'fragmented' | null;
  dreamType?: string[];
  characters?: string[];
  places?: string[];
}

export interface InterpretationRequest {
  dreamId: string;
  description: string;
  style: 'symbolic' | 'mythological' | 'psychological';
  languageHint?: string;
  metadata?: InterpretationRequestMetadata;
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
