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
  /**
   * The English text-to-image prompt the interpretation model wrote for this dream, consumed
   * server-side by the generate-image Edge Function. Null for interpretations produced before
   * prompt version 2.0.0 — those fall back to a template built from description + keywords.
   */
  imagePrompt: string | null;
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
  /** The emotions the dreamer tagged themselves — read against, not merged with, the ones the model names. */
  emotions?: string[];
  /** The lucid marker from the log screen, distinct from the finer-grained `lucidity` enum. */
  isLucid?: boolean;
  /** ISO timestamp of the night the dream occurred — supplies day-of-week and month, never a season. */
  occurredAt?: string | null;
  sleepQuality?: number | null;
}

export interface InterpretationRequest {
  dreamId: string;
  description: string;
  /**
   * Omit to let the Edge Function fall back to the dreamer's own `profiles.interpretation_style`.
   * Only set this to override that preference for a single request.
   */
  style?: 'symbolic' | 'mythological' | 'psychological';
  /** BCP-47 language tag, used only to break the tie on dreams too short to language-detect. */
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
