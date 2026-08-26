/**
 * Vocabulary and types for the log screen's second layer of metadata: sleep timing
 * and quality, the dream's own clarity/tone/ending, its type tags, and the private
 * "Contexte personnel" block. Shared between the log screen, the repository and the
 * sync layer so the option lists live in exactly one place.
 */

export const LUCIDITY_LEVELS = ['none', 'semi', 'lucid', 'full'] as const;
export type Lucidity = (typeof LUCIDITY_LEVELS)[number];

export const TONE_OPTIONS = ['positive', 'neutral', 'negative', 'mixed'] as const;
export type Tone = (typeof TONE_OPTIONS)[number];

export const DREAM_ENDING_OPTIONS = ['resolved', 'unresolved', 'fragmented'] as const;
export type DreamEnding = (typeof DREAM_ENDING_OPTIONS)[number];

/** Type tags the dreamer can attach at log time. Free-form chips, not AI-generated. */
export const DREAM_TYPE_OPTIONS = [
  'recurring',
  'nightmare',
  'lucid',
  'prophetic',
  'flying',
  'falling',
] as const;
export type DreamType = (typeof DREAM_TYPE_OPTIONS)[number];

/** Private context — local-only. See src/db/client.ts for why these never sync. */
export const PRESLEEP_SUBSTANCE_OPTIONS = [
  'melatonin',
  'late_caffeine',
  'alcohol',
  'cannabis',
  'mdma',
  'psychedelics',
  'stimulants',
  'sleep_aid',
  'none',
] as const;
export type PresleepSubstance = (typeof PRESLEEP_SUBSTANCE_OPTIONS)[number];

/** true only once the dreamer knew, at some point, that they were dreaming. */
export function isLucidLevel(lucidity: Lucidity): boolean {
  return lucidity === 'lucid' || lucidity === 'full';
}
