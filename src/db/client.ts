import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const DB_NAME = 'morpheo.db';

export const sqlite = SQLite.openDatabaseSync(DB_NAME);

sqlite.execSync(`PRAGMA journal_mode = WAL;`);
sqlite.execSync(`PRAGMA foreign_keys = ON;`);

sqlite.execSync(`
  CREATE TABLE IF NOT EXISTS dreams (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    description TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_modified_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    edited_since_interpretation INTEGER NOT NULL DEFAULT 0,
    sync_status TEXT NOT NULL DEFAULT 'local' CHECK(sync_status IN ('local','sync_pending','synced','sync_failed'))
  );
`);

sqlite.execSync(`
  CREATE TABLE IF NOT EXISTS interpretations (
    id TEXT PRIMARY KEY,
    dream_id TEXT NOT NULL REFERENCES dreams(id),
    overall_reading TEXT NOT NULL,
    keywords TEXT NOT NULL,
    emotions TEXT NOT NULL,
    cultural_references TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','low')),
    is_degraded INTEGER NOT NULL DEFAULT 0,
    prompt_version TEXT NOT NULL,
    model_used TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

sqlite.execSync(`
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    dream_id TEXT NOT NULL REFERENCES dreams(id),
    media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
    generation_status TEXT NOT NULL DEFAULT 'pending' CHECK(generation_status IN ('pending','processing','complete','failed','safety_blocked')),
    storage_key TEXT,
    local_cache_path TEXT,
    regeneration_count INTEGER NOT NULL DEFAULT 0,
    max_regenerations INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

sqlite.execSync(`
  CREATE TABLE IF NOT EXISTS recurrence_patterns (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    pattern_type TEXT NOT NULL CHECK(pattern_type IN ('keyword','emotion','cultural_reference')),
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    dream_ids TEXT NOT NULL DEFAULT '[]',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// `CREATE TABLE IF NOT EXISTS` above is a no-op on a device that already has this table
// from before dream_ids existed — add it explicitly so recurrenceRepository's queries
// (which select dream_ids) don't fail with "no such column" on already-installed apps.
const recurrencePatternsColumns = sqlite.getAllSync<{ name: string }>(
  `PRAGMA table_info(recurrence_patterns);`
);
if (!recurrencePatternsColumns.some(col => col.name === 'dream_ids')) {
  sqlite.execSync(
    `ALTER TABLE recurrence_patterns ADD COLUMN dream_ids TEXT NOT NULL DEFAULT '[]';`
  );
}

sqlite.execSync(`
  CREATE INDEX IF NOT EXISTS idx_dreams_user_id ON dreams(user_id);
  CREATE INDEX IF NOT EXISTS idx_dreams_sync_status ON dreams(sync_status);
  CREATE INDEX IF NOT EXISTS idx_interpretations_dream_id ON interpretations(dream_id);
  CREATE INDEX IF NOT EXISTS idx_media_dream_id ON media(dream_id);
  CREATE INDEX IF NOT EXISTS idx_recurrence_user ON recurrence_patterns(user_id, symbol);
`);

export const db = drizzle(sqlite, { schema });
