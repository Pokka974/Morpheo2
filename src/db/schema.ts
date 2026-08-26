import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const dreams = sqliteTable('dreams', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  description: text('description').notNull(),
  occurredAt: text('occurred_at').notNull(),
  /** JSON array of emotion keys the dreamer selected — see `emotionColors` in the tokens. */
  emotions: text('emotions').notNull().default('[]'),
  isLucid: integer('is_lucid', { mode: 'boolean' }).notNull().default(false),
  loggedAt: text('logged_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  lastModifiedAt: text('last_modified_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  editedSinceInterpretation: integer('edited_since_interpretation', { mode: 'boolean' })
    .notNull()
    .default(false),
  syncStatus: text('sync_status', { enum: ['local', 'sync_pending', 'synced', 'sync_failed'] })
    .notNull()
    .default('local'),
  // --- Sleep ---
  bedtime: text('bedtime'),
  wakeTime: text('wake_time'),
  /** 1–5. */
  sleepQuality: integer('sleep_quality'),
  // --- The dream itself ---
  /** 1–5. */
  clarity: integer('clarity'),
  /** Replaces the old boolean-only marker; `isLucid` stays as a derived convenience flag. */
  lucidity: text('lucidity', { enum: ['none', 'semi', 'lucid', 'full'] })
    .notNull()
    .default('none'),
  tone: text('tone', { enum: ['positive', 'neutral', 'negative', 'mixed'] }),
  dreamEnding: text('dream_ending', { enum: ['resolved', 'unresolved', 'fragmented'] }),
  /** JSON array of type tags (e.g. "nightmare", "recurring"). */
  dreamType: text('dream_type').notNull().default('[]'),
  // --- Who, where ---
  /** JSON array of role-based tags (e.g. "ma mère", "un inconnu"), not names. */
  characters: text('characters').notNull().default('[]'),
  /** JSON array of place tags. */
  places: text('places').notNull().default('[]'),
  /** Set when this dream continues an earlier one — forms a recurrence chain. */
  linkedDreamId: text('linked_dream_id'),
  // --- Private context — local-only, never synced to Supabase, never sent to the AI,
  // excluded from export. See src/db/client.ts for why these have no Postgres column. ---
  /** 1–5. */
  dayStress: integer('day_stress'),
  /** JSON array (e.g. "melatonin", "late_caffeine"). */
  presleepSubstances: text('presleep_substances').notNull().default('[]'),
});

export const interpretations = sqliteTable('interpretations', {
  id: text('id').primaryKey(),
  dreamId: text('dream_id')
    .notNull()
    .references(() => dreams.id),
  overallReading: text('overall_reading').notNull(),
  keywords: text('keywords').notNull(),
  emotions: text('emotions').notNull(),
  culturalReferences: text('cultural_references').notNull(),
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] }).notNull(),
  isDegraded: integer('is_degraded', { mode: 'boolean' }).notNull().default(false),
  promptVersion: text('prompt_version').notNull(),
  modelUsed: text('model_used').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  /** The dominant Jungian/narrative archetype Claude identified for this dream. */
  archetype: text('archetype'),
  /** JSON array of AI-identified recurring themes — distinct from the literal `keywords`. */
  themes: text('themes').notNull().default('[]'),
  /** 1 (literal, few symbols) to 4 (highly symbolic, densely layered). */
  symbolicDensity: integer('symbolic_density'),
});

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  dreamId: text('dream_id')
    .notNull()
    .references(() => dreams.id),
  mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
  generationStatus: text('generation_status', {
    enum: ['pending', 'processing', 'complete', 'failed', 'safety_blocked'],
  })
    .notNull()
    .default('pending'),
  storageKey: text('storage_key'),
  localCachePath: text('local_cache_path'),
  regenerationCount: integer('regeneration_count').notNull().default(0),
  maxRegenerations: integer('max_regenerations').notNull().default(3),
  errorMessage: text('error_message'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const recurrencePatterns = sqliteTable('recurrence_patterns', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  symbol: text('symbol').notNull(),
  patternType: text('pattern_type', {
    enum: ['keyword', 'emotion', 'cultural_reference', 'theme'],
  }).notNull(),
  occurrenceCount: integer('occurrence_count').notNull().default(0),
  dreamIds: text('dream_ids').notNull().default('[]'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Dream = typeof dreams.$inferSelect;
export type NewDream = typeof dreams.$inferInsert;
export type Interpretation = typeof interpretations.$inferSelect;
export type NewInterpretation = typeof interpretations.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type RecurrencePattern = typeof recurrencePatterns.$inferSelect;
