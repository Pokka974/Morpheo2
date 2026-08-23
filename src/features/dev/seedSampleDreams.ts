import { sqlite } from '@db/client';
import { saveDream } from '@features/dream-log/dreamRepository';
import { syncPendingDreams } from '@features/dream-log/syncService';
import { recordRecurrence } from '@features/recurrence/recurrenceRepository';
import { generateId } from '@shared/id';

interface SeedDream {
  daysAgo: number;
  description: string;
  overallReading: string;
  keywords: string[];
  emotions: string[];
  culturalReference: { symbol: string; tradition: string; meaning: string };
}

// Keywords and emotions deliberately overlap across dreams (ocean/water, forest,
// flying, door) so the Insights constellation has real shared-dream edges instead of
// isolated nodes, and emotions are drawn from the real palette (theme/tokens.ts) so the
// emotion ribbon and chip colours render as they would for genuine data.
const SEED_DREAMS: SeedDream[] = [
  {
    daysAgo: 2,
    description:
      'I was swimming in a dark ocean, the water pulling me deeper until I found a glowing door beneath the waves.',
    overallReading:
      'Descending water often marks a passage toward something submerged in the self — the glowing door suggests that passage leads somewhere worth reaching, not just away from something.',
    keywords: ['ocean', 'water', 'door', 'depth'],
    emotions: ['fear', 'wonder'],
    culturalReference: {
      symbol: 'ocean',
      tradition: 'Jungian',
      meaning: 'the depths of the unconscious mind',
    },
  },
  {
    daysAgo: 5,
    description:
      'I could fly over a moonlit forest, weightless, until the trees turned to glass and shattered beneath me.',
    overallReading:
      'Flight dreams often track a feeling of freedom running up against a fragile boundary — the glass trees mark exactly where that lightness meets something breakable.',
    keywords: ['forest', 'flying', 'glass', 'moon'],
    emotions: ['freedom', 'anxiety'],
    culturalReference: {
      symbol: 'forest',
      tradition: 'Folklore',
      meaning: 'the unknown, a place of transformation',
    },
  },
  {
    daysAgo: 8,
    description:
      'A river carried me past my childhood home, calm and slow, while my grandmother waved from the shore.',
    overallReading:
      'Slow-moving water paired with a familiar figure on the bank tends to mark a season of reflection rather than urgency — a gentle look back, not a warning.',
    keywords: ['water', 'river', 'home', 'family'],
    emotions: ['calm', 'nostalgia'],
    culturalReference: {
      symbol: 'river',
      tradition: 'Taoist',
      meaning: 'the natural flow of life',
    },
  },
  {
    daysAgo: 11,
    description:
      'I was lost in a forest at night, chased by something I never saw, my legs too heavy to run.',
    overallReading:
      'An unseen pursuer paired with heavy legs is a classic anxiety pattern — the threat rarely represents a literal danger so much as a pressure you feel you cannot outrun right now.',
    keywords: ['forest', 'chase', 'night', 'fear'],
    emotions: ['fear', 'anxiety'],
    culturalReference: {
      symbol: 'night',
      tradition: 'Jungian',
      meaning: 'the shadow self, hidden fears',
    },
  },
  {
    daysAgo: 15,
    description:
      'Flying above the ocean at sunrise, the water turned gold, and I felt like nothing could touch me.',
    overallReading:
      'Sunrise light over open water, paired with effortless flight, is one of the more unambiguous positive patterns — a sense of arriving somewhere clear after a period of change.',
    keywords: ['ocean', 'flying', 'water', 'sunrise'],
    emotions: ['joy', 'freedom'],
    culturalReference: {
      symbol: 'sunrise',
      tradition: 'Egyptian',
      meaning: 'renewal and rebirth',
    },
  },
  {
    daysAgo: 19,
    description:
      "I found a hidden door in my own house that led to a garden I'd never seen, full of strange flowers that hummed.",
    overallReading:
      'A hidden room within a familiar house is one of the most common motifs there is — it almost always points to an unexplored part of your own life, not the house itself.',
    keywords: ['door', 'garden', 'house', 'flowers'],
    emotions: ['curiosity', 'wonder'],
    culturalReference: {
      symbol: 'garden',
      tradition: 'Biblical',
      meaning: 'paradise, untouched potential',
    },
  },
];

/**
 * Dev-only: writes realistic dreams + interpretations + recurrence data directly to
 * local SQLite so the Insights page has something to render. Bypasses the real
 * interpret Edge Function entirely (no Claude/DALL-E cost) — this is synthetic local
 * data, not a real interpretation.
 */
export async function seedSampleDreams(userId: string): Promise<{ count: number }> {
  const now = new Date();

  for (const seed of SEED_DREAMS) {
    const dreamId = generateId();
    const occurredAt = new Date(now);
    occurredAt.setDate(occurredAt.getDate() - seed.daysAgo);

    await saveDream({
      id: dreamId,
      userId,
      description: seed.description,
      occurredAt: occurredAt.toISOString().slice(0, 10),
    });

    await sqlite.runAsync(
      `INSERT OR REPLACE INTO interpretations
        (id, dream_id, overall_reading, keywords, emotions, cultural_references, confidence, is_degraded, prompt_version, model_used, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        dreamId,
        seed.overallReading,
        JSON.stringify(seed.keywords),
        JSON.stringify(seed.emotions),
        JSON.stringify([seed.culturalReference]),
        'high',
        0,
        'dev-seed',
        'dev-seed',
        occurredAt.toISOString(),
      ]
    );

    await recordRecurrence(userId, dreamId, 'keyword', seed.keywords, occurredAt.toISOString());
    await recordRecurrence(userId, dreamId, 'emotion', seed.emotions, occurredAt.toISOString());
  }

  // Best-effort, same as the draft-save path — seeding still succeeds locally (which is
  // all Insights needs) even if the device is offline.
  syncPendingDreams().catch((err: unknown) => {
    console.error('Seed dreams saved locally; push to Supabase failed:', err);
  });

  return { count: SEED_DREAMS.length };
}
