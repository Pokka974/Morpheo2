# Data Model: Morpheo

**Branch**: `001-morpheo-app` | **Date**: 2026-08-14

The data model is split across two layers:
- **Supabase PostgreSQL** — authoritative server-side store for all data
- **Local SQLite (expo-sqlite + Drizzle ORM)** — client-side mirror for offline capability

Tables marked **[sync]** exist in both layers. Tables marked **[server]** are Supabase-only. Tables marked **[client]** are SQLite-only columns.

---

## Entity Relationship Overview

```
auth.users (Supabase managed)
  └── profiles [server]
        ├── entitlements [server]
        ├── consent_records [server]
        └── dreams [sync]
              ├── interpretations [sync]
              ├── media [sync]
              └── generation_jobs [server]

  profiles → recurrence_patterns [sync]
  system_prompts [server]
```

---

## Table Definitions

### `profiles` [server]

Extends Supabase's `auth.users`. Created automatically via Supabase Auth trigger on new user sign-up.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users.id` ON DELETE CASCADE | |
| `subscription_tier` | `text` | NOT NULL DEFAULT `'free'` CHECK IN ('free','premium') | Source of truth from `entitlements`; denormalized here for RLS performance |
| `interpretation_style` | `text` | NOT NULL DEFAULT `'symbolic'` CHECK IN ('symbolic','mythological','psychological') | User's chosen style preset |
| `ai_consent_granted` | `boolean` | NOT NULL DEFAULT `false` | Drives FR-025; blocks AI calls if false |
| `ai_consent_date` | `timestamptz` | NULLABLE | Set when consent first granted |
| `ai_consent_provider_disclosed` | `text` | NULLABLE | Provider category string shown to user at consent time |
| `notification_reminders_enabled` | `boolean` | NOT NULL DEFAULT `false` | |
| `notification_reminder_time` | `time` | NULLABLE | Local time for reminder; null = not set |
| `push_token` | `text` | NULLABLE | Expo push token; updated on app open |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | Updated by trigger |

**RLS**: User can SELECT and UPDATE their own row only. `subscription_tier` is updated only by the entitlement Edge Function (service role key).

---

### `entitlements` [server]

One row per user. Managed exclusively by the RevenueCat webhook Edge Function.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `user_id` | `uuid` | UNIQUE NOT NULL FK → `profiles.id` ON DELETE CASCADE | |
| `subscription_tier` | `text` | NOT NULL DEFAULT `'free'` CHECK IN ('free','premium') | |
| `interpretations_used_this_month` | `integer` | NOT NULL DEFAULT `0` CHECK >= 0 | Incremented by interpretation Edge Function |
| `images_used_this_month` | `integer` | NOT NULL DEFAULT `0` CHECK >= 0 | Incremented by image generation Edge Function |
| `monthly_interpretation_limit` | `integer` | NOT NULL DEFAULT `5` | 5 free / NULL = unlimited for premium |
| `monthly_image_limit` | `integer` | NOT NULL DEFAULT `3` | 3 free / NULL = unlimited for premium |
| `reset_date` | `date` | NOT NULL | First day of next calendar month; set on creation, updated by reset cron |
| `revenuecat_customer_id` | `text` | NULLABLE | |
| `subscription_expires_at` | `timestamptz` | NULLABLE | Null for free tier |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**RLS**: User can SELECT their own row. No client-side UPDATE permitted. Service role key only for writes.

**Monthly reset**: A Supabase cron job (pg_cron, runs 00:01 UTC on the 1st of each month) resets `interpretations_used_this_month = 0`, `images_used_this_month = 0`, and advances `reset_date`.

---

### `consent_records` [server]

Append-only audit trail of consent decisions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `user_id` | `uuid` | NOT NULL FK → `profiles.id` ON DELETE CASCADE | |
| `status` | `text` | NOT NULL CHECK IN ('granted','withdrawn') | |
| `provider_category_disclosed` | `text` | NOT NULL | Text shown to user at consent point |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**RLS**: User can SELECT their own rows. INSERT only via Edge Function (no client direct insert). No UPDATE or DELETE.

---

### `system_prompts` [server]

Versioned, server-side AI base prompts. Client never sees this table.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `version` | `text` | NOT NULL UNIQUE | Semver e.g. `"1.0.0"` |
| `base_prompt` | `text` | NOT NULL | Full system prompt text |
| `style_symbolic` | `text` | NOT NULL | Style layer appended for symbolic preset |
| `style_mythological` | `text` | NOT NULL | Style layer appended for mythological preset |
| `style_psychological` | `text` | NOT NULL | Style layer appended for psychological preset |
| `is_active` | `boolean` | NOT NULL DEFAULT `false` | Exactly one row has `is_active = true` |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `activated_at` | `timestamptz` | NULLABLE | When this version became active |

**RLS**: No client access. Service role only. The interpretation Edge Function fetches the active prompt at call time.

---

### `dreams` [sync]

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | Generated client-side (`crypto.randomUUID()`) for offline support |
| `user_id` | `uuid` | NOT NULL FK → `profiles.id` ON DELETE CASCADE | |
| `description` | `text` | NOT NULL CHECK length >= 20 | Min length enforced at server on sync |
| `dream_date` | `date` | NOT NULL | User-supplied; may differ from `logged_at` |
| `logged_at` | `timestamptz` | NOT NULL | When the entry was first created |
| `last_modified_at` | `timestamptz` | NOT NULL DEFAULT `now()` | Last-write-wins conflict key; updated on every edit |
| `edited_since_interpretation` | `boolean` | NOT NULL DEFAULT `false` | Set `true` on description edit post-interpretation; cleared when re-generation accepted or kept |
| `is_deleted` | `boolean` | NOT NULL DEFAULT `false` | Soft-delete for sync propagation; hard-delete runs after sync acknowledged |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| **[client]** `sync_status` | `text` | LOCAL SQLite ONLY | `'local'` \| `'synced'` \| `'sync_pending'` \| `'sync_failed'` |

**RLS**: User can SELECT, INSERT, UPDATE, DELETE their own rows only.

**Conflict resolution**: On sync, the server compares `last_modified_at`. The version with the latest timestamp wins. Losing version is discarded.

**Index**: `(user_id, dream_date DESC)` for journal list query; `(user_id, is_deleted)` for filtering.

---

### `interpretations` [sync]

One-to-one with `dreams`. Created by the interpretation Edge Function after successful AI call.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `dream_id` | `uuid` | UNIQUE NOT NULL FK → `dreams.id` ON DELETE CASCADE | |
| `user_id` | `uuid` | NOT NULL FK → `profiles.id` | Denormalized for RLS |
| `overall_reading` | `text` | NOT NULL | 200-400 word reading |
| `keywords` | `text[]` | NOT NULL | Array of 3-10 symbolic keywords |
| `emotions` | `text[]` | NOT NULL | Array of 1-8 emotions |
| `cultural_references` | `jsonb` | NOT NULL DEFAULT `'[]'` | Array of `{symbol, tradition, meaning}` |
| `confidence` | `text` | NOT NULL CHECK IN ('high','medium','low') | From Claude tool response |
| `is_degraded` | `boolean` | NOT NULL DEFAULT `false` | True when confidence=low or tool_use failed |
| `prompt_version` | `text` | NOT NULL | FK to `system_prompts.version` at time of call |
| `model_used` | `text` | NOT NULL | e.g. `"claude-sonnet-4-6"` |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**RLS**: User can SELECT their own rows. INSERT/UPDATE only via service role (Edge Function).

**Index**: `(user_id)` for recurrence queries; `(dream_id)` for lookups.

**Trigger**: `AFTER INSERT` → calls `compute_recurrence_patterns(user_id, keywords, emotions, dream_id)` PostgreSQL function.

---

### `media` [sync]

One dream can have one image and one video (separate rows by `media_type`).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `dream_id` | `uuid` | NOT NULL FK → `dreams.id` ON DELETE CASCADE | |
| `user_id` | `uuid` | NOT NULL FK → `profiles.id` | Denormalized for RLS |
| `media_type` | `text` | NOT NULL CHECK IN ('image','video') | |
| `storage_path` | `text` | NULLABLE | Supabase Storage path; null until generation complete |
| `generation_status` | `text` | NOT NULL DEFAULT `'pending'` CHECK IN ('pending','processing','complete','failed','safety_blocked') | |
| `generation_job_id` | `text` | NULLABLE | External job ID (DALL-E request ID / Luma generation ID) |
| `provider` | `text` | NULLABLE | `'dalle3'` \| `'luma_dream_machine'` |
| `safety_input_passed` | `boolean` | NULLABLE | Null until evaluated |
| `safety_output_passed` | `boolean` | NULLABLE | Null until output received |
| `regeneration_count` | `integer` | NOT NULL DEFAULT `0` | |
| `max_regenerations` | `integer` | NOT NULL | 3 free / 5 premium; set at row creation |
| `error_message` | `text` | NULLABLE | Set on failure |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| **[client]** `local_cache_path` | `text` | LOCAL SQLite ONLY | `expo-file-system` path to cached file |

**RLS**: User can SELECT their own rows. INSERT/UPDATE only via service role (Edge Function).

**Unique constraint**: `(dream_id, media_type)` — one image and one video per dream.

---

### `generation_jobs` [server]

Tracks async job state for interpretation, image, and video generation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `user_id` | `uuid` | NOT NULL FK → `profiles.id` | |
| `dream_id` | `uuid` | NOT NULL FK → `dreams.id` ON DELETE CASCADE | |
| `job_type` | `text` | NOT NULL CHECK IN ('interpretation','image','video') | |
| `status` | `text` | NOT NULL DEFAULT `'queued'` CHECK IN ('queued','processing','complete','failed') | |
| `external_job_id` | `text` | NULLABLE | Luma `generation_id`; null for DALL-E (sync) and Claude (sync) |
| `result_id` | `uuid` | NULLABLE | FK to `interpretations.id` or `media.id` on completion |
| `error_message` | `text` | NULLABLE | |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Note**: Interpretation and image jobs run synchronously within the Edge Function; the `generation_jobs` row is created and immediately resolved in the same request. Video jobs are truly async (Luma takes 2-5 minutes) and the client polls this table via a Supabase Realtime subscription.

**RLS**: User can SELECT their own rows. No client writes.

---

### `recurrence_patterns` [sync]

Maintained by a PostgreSQL trigger on `interpretations` INSERT. One row per (user, term, term_type).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT `gen_random_uuid()` | |
| `user_id` | `uuid` | NOT NULL FK → `profiles.id` ON DELETE CASCADE | |
| `term` | `text` | NOT NULL | Keyword or emotion string |
| `term_type` | `text` | NOT NULL CHECK IN ('keyword','emotion') | |
| `occurrence_count` | `integer` | NOT NULL DEFAULT `1` | |
| `first_seen_at` | `timestamptz` | NOT NULL | |
| `last_seen_at` | `timestamptz` | NOT NULL | |
| `dream_ids` | `uuid[]` | NOT NULL DEFAULT `'{}'` | Array of dream IDs where this term appears |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**Unique constraint**: `(user_id, term, term_type)`.

**RLS**: User can SELECT their own rows. No client writes (managed by trigger).

**Free vs premium queries**: Free users: top 3 keywords + top 3 emotions, last 30 days. Premium users: full data, all time ranges.

---

## Local SQLite Schema (Client Mirror)

The client SQLite database mirrors the synced tables with an added `sync_status` column and `local_cache_path` where applicable. Tables `profiles`, `entitlements`, `consent_records`, `system_prompts`, `generation_jobs` are **not** stored in SQLite.

**Local-only additions per table**:

```
dreams:         + sync_status TEXT NOT NULL DEFAULT 'local'
media:          + local_cache_path TEXT
```

**Drizzle ORM schema file**: `src/db/schema.ts` defines all tables with TypeScript types. Migrations live in `src/db/migrations/`.

---

## State Transitions

### DreamEntry sync_status

```
[new entry created offline]
        │
        ▼
     'local'
        │  connectivity detected + sync queued
        ▼
  'sync_pending'
        │                    │
   sync success          sync failed
        │                    │
        ▼                    ▼
    'synced'           'sync_failed'
                            │
                    retry on next connectivity
                            │
                            ▼
                      'sync_pending'
```

### media.generation_status

```
 'pending'  ──(Edge Function begins)──►  'processing'
                                               │
                    ┌──────────────────────────┤
                    │                          │
              safety blocked            generation attempt
                    │                          │
                    ▼                  ┌───────┴───────┐
            'safety_blocked'       success          failure
                                       │               │
                                       ▼               ▼
                                  'complete'        'failed'
                                                       │
                                           (regeneration_count < max)
                                                       │
                                              back to 'pending'
```
