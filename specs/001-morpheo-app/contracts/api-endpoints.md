# API Contracts: Morpheo Backend

**Branch**: `001-morpheo-app` | **Date**: 2026-08-14

All requests require `Authorization: Bearer <supabase_jwt>` unless marked **[public]**.
Base URL: `https://<project>.supabase.co`

Two API layers:
1. **PostgREST** (`/rest/v1/`) — auto-generated CRUD for synced tables, gated by RLS
2. **Edge Functions** (`/functions/v1/`) — AI orchestration, entitlement enforcement, webhooks

---

## PostgREST Auto-Endpoints (`/rest/v1/`)

These are generated automatically by Supabase from the schema. RLS policies enforce user isolation. All payloads are JSON. Standard PostgREST query params (`select`, `order`, `limit`, `offset`, `eq`, `gte`, etc.) apply.

### Dreams

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/dreams?user_id=eq.{uid}&is_deleted=eq.false&order=dream_date.desc` | List journal entries (paginated) |
| `POST` | `/rest/v1/dreams` | Create new dream entry |
| `PATCH` | `/rest/v1/dreams?id=eq.{id}` | Update dream (description edit, is_deleted flag) |
| `DELETE` | `/rest/v1/dreams?id=eq.{id}` | Hard-delete (used after soft-delete sync confirms) |

**POST /rest/v1/dreams body**:
```json
{
  "id": "uuid",
  "description": "string (min 20 chars)",
  "dream_date": "YYYY-MM-DD",
  "logged_at": "ISO-8601",
  "last_modified_at": "ISO-8601",
  "edited_since_interpretation": false
}
```

**PATCH /rest/v1/dreams body** (description edit):
```json
{
  "description": "string",
  "last_modified_at": "ISO-8601",
  "edited_since_interpretation": true
}
```

**PATCH /rest/v1/dreams body** (soft-delete):
```json
{
  "is_deleted": true,
  "last_modified_at": "ISO-8601"
}
```

### Interpretations (read-only via PostgREST)

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/interpretations?dream_id=eq.{id}` | Fetch interpretation for a dream |
| `GET` | `/rest/v1/interpretations?user_id=eq.{uid}&select=keywords,emotions,dream_id` | Fetch all keywords/emotions for recurrence display |

### Media (read-only via PostgREST)

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/media?dream_id=eq.{id}` | Fetch media records for a dream |
| `GET` | `/rest/v1/media?id=eq.{id}&select=generation_status` | Poll generation status |

### Recurrence Patterns (read-only via PostgREST)

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/recurrence_patterns?user_id=eq.{uid}&order=occurrence_count.desc` | All recurrence data |
| `GET` | `/rest/v1/recurrence_patterns?user_id=eq.{uid}&last_seen_at=gte.{30_days_ago}&order=occurrence_count.desc&limit=3` | Free-tier: top 3 each type, last 30 days |

### Generation Jobs (read-only via PostgREST + Realtime)

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/generation_jobs?id=eq.{job_id}` | Poll async job status |

**Realtime subscription** (for video generation status):
```
channel: `generation_jobs:id=eq.{job_id}`
event: UPDATE
→ client receives status change without polling
```

### Profiles

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/profiles?id=eq.{uid}` | Fetch user profile + preferences |
| `PATCH` | `/rest/v1/profiles?id=eq.{uid}` | Update style, notification settings, push token |

### Entitlements (read-only for client)

| Method | Path | Description |
|---|---|---|
| `GET` | `/rest/v1/entitlements?user_id=eq.{uid}` | Fetch current usage + tier for display |

---

## Edge Functions (`/functions/v1/`)

### `POST /functions/v1/interpret`

Submit a dream for AI interpretation. Enforces entitlement server-side before calling Claude.

**Request**:
```json
{
  "dream_id": "uuid",
  "dream_description": "string",
  "language_hint": "string (optional, e.g. 'fr', 'en')"
}
```

**Entitlement check** (server-side, before AI call):
1. Verify `profiles.ai_consent_granted = true`; else return 403
2. Fetch `entitlements` row; verify `interpretations_used < monthly_interpretation_limit` (null limit = premium/unlimited); else return 429
3. Increment `interpretations_used_this_month` (atomic increment)

**Success response** `200`:
```json
{
  "job_id": "uuid",
  "interpretation": {
    "id": "uuid",
    "overall_reading": "string",
    "keywords": ["string"],
    "emotions": ["string"],
    "cultural_references": [
      { "symbol": "string", "tradition": "string", "meaning": "string" }
    ],
    "confidence": "high" | "medium" | "low",
    "is_degraded": false,
    "prompt_version": "string"
  }
}
```

**Degraded response** `200` (when Claude returns low confidence or tool_use fails):
```json
{
  "job_id": "uuid",
  "interpretation": {
    "id": "uuid",
    "is_degraded": true,
    "overall_reading": null,
    "keywords": [],
    "emotions": [],
    "cultural_references": [],
    "confidence": "low",
    "prompt_version": "string"
  }
}
```

**Error responses**:
- `401` — not authenticated
- `403` — AI consent not granted
- `422` — dream_description below 20 chars
- `429` — monthly limit exceeded `{ "error": "limit_exceeded", "reset_date": "YYYY-MM-DD" }`
- `503` — AI provider unavailable (client should retry)

---

### `POST /functions/v1/generate-image`

Generate an AI image for a dream. Enforces entitlement and content safety.

**Request**:
```json
{
  "dream_id": "uuid",
  "dream_description": "string",
  "keywords": ["string"],
  "is_regeneration": false
}
```

**Entitlement check**: Same pattern as interpret — one call to `consume_image_credit(user_id)`,
which checks and increments in a single statement. It draws from `images_used_this_month`
first and falls back to the one-time `bonus_image_credits` (the welcome image), returning
`'monthly'`, `'bonus'` or `'denied'`. Regenerations do not spend a credit — they are bounded
by the entry's own `max_regenerations`. Any failure after consumption calls
`refund_image_credit(user_id, source)`.

**Content safety check**: Input description is evaluated against a blocklist + Claude content safety heuristic before calling OpenAI.

**Success response** `200`:
```json
{
  "media": {
    "id": "uuid",
    "generation_status": "complete",
    "storage_path": "string",
    "signed_url": "string (1h expiry)",
    "regeneration_count": 0,
    "max_regenerations": 0
  }
}
```

**Error responses**:
- `400` — content safety block `{ "error": "safety_blocked", "reason": "input" | "output" }`
- `429` — monthly image limit exceeded `{ "error": "limit_reached", "resetDate": "ISO-8601" }`
- `409` — regeneration limit reached `{ "error": "regen_limit_reached", "max": 0 }` (0 free, 5 premium)
- `500` — entitlement check failed `{ "error": "entitlement_check_failed" }`
- `503` — image provider unavailable

---

### `POST /functions/v1/generate-video`

Submit a video generation job (premium only). Returns immediately with a job ID; generation is async.

**Request**:
```json
{
  "dream_id": "uuid",
  "dream_description": "string",
  "keywords": ["string"],
  "is_regeneration": false
}
```

**Entitlement check**: Verifies `subscription_tier = 'premium'`; else return 403.

**Success response** `202` (Accepted, not yet complete):
```json
{
  "job_id": "uuid",
  "status": "queued",
  "media_id": "uuid",
  "estimated_duration_seconds": 120
}
```

Client subscribes to `generation_jobs:id=eq.{job_id}` Realtime channel for status updates. On completion, a push notification is also sent.

**Error responses**:
- `403` — not a premium user
- `400` — content safety block on input
- `409` — regeneration limit reached

---

### `GET /functions/v1/media-url`

Get a fresh signed URL for a media asset (called when cached URL expires).

**Request**: `?media_id={uuid}`

**Response** `200`:
```json
{
  "signed_url": "string",
  "expires_at": "ISO-8601"
}
```

---

### `POST /functions/v1/export-data`

Trigger a full data export for the authenticated user.

**Request**: `{}` (empty body; user identified from JWT)

**Response** `202`:
```json
{
  "export_id": "uuid",
  "status": "queued",
  "estimated_ready_minutes": 5
}
```

Export is generated asynchronously and delivered via a Supabase Storage signed URL sent to the user's email and shown in Settings. The export contains a JSON file of all dreams/interpretations and a manifest of media asset URLs.

---

### `DELETE /functions/v1/account`

Permanent, irreversible deletion of the authenticated user's account and all data.

**Request**:
```json
{
  "confirmation": "DELETE MY ACCOUNT"
}
```

**Response** `200`:
```json
{
  "status": "scheduled",
  "deletion_completes_by": "ISO-8601 (30 days from now)"
}
```

Deletion flow:
1. Marks the account as `deletion_scheduled_at = now()`
2. Immediately clears all session tokens (signs user out of all devices)
3. A background job performs hard deletion of all user data within 30 days
4. Confirmation email is sent

---

### `POST /functions/v1/webhooks/revenuecat` [public, HMAC-verified]

Receives RevenueCat subscription event webhooks. Validates HMAC signature before processing.

**Events handled**:
- `INITIAL_PURCHASE` → update `entitlements.subscription_tier = 'premium'`, set `subscription_expires_at`
- `RENEWAL` → update `subscription_expires_at`
- `CANCELLATION` → subscription remains premium until `subscription_expires_at`
- `EXPIRATION` → update `entitlements.subscription_tier = 'free'`, also updates `profiles.subscription_tier`
- `BILLING_ISSUE` → set a flag; client shows renewal prompt on next open

**Response**: `200 OK` (always, to prevent RevenueCat retries on processing errors)

---

## Supabase Auth Endpoints (managed by Supabase)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/v1/signup` | Email + password registration |
| `POST` | `/auth/v1/token?grant_type=password` | Email sign-in |
| `POST` | `/auth/v1/token?grant_type=refresh_token` | Silent session refresh |
| `POST` | `/auth/v1/logout` | Sign out |
| `GET` | `/auth/v1/authorize?provider=google` | Google OAuth initiation |
| `GET` | `/auth/v1/authorize?provider=apple` | Apple OAuth initiation |

**Session management on client**:
- Supabase JS SDK (`@supabase/supabase-js`) handles token refresh automatically
- JWT stored in `expo-secure-store` (not AsyncStorage)
- Biometric/PIN gate is checked on app foreground, independent of JWT validity

---

## Realtime Subscriptions

| Channel | Event | Purpose |
|---|---|---|
| `generation_jobs:id=eq.{job_id}` | `UPDATE` | Video generation status updates |
| `media:dream_id=eq.{dream_id}` | `UPDATE` | Image generation status (for in-progress display) |
