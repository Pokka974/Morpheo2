# Research: Morpheo Technical Decisions

**Branch**: `001-morpheo-app` | **Date**: 2026-08-14

All decisions below are resolved. No NEEDS CLARIFICATION items remain.

---

## 1. Client Framework: Expo Managed Workflow

**Decision**: Expo SDK 53+ managed workflow. No bare workflow.

**Rationale**: Every required native capability is available in managed workflow:

| Capability | Module | Managed? |
|---|---|---|
| Biometric / PIN lock | `expo-local-authentication` | ✓ |
| Local SQLite | `expo-sqlite` | ✓ |
| Encrypted key-value store | `expo-secure-store` | ✓ |
| Push + local notifications | `expo-notifications` | ✓ |
| Microphone (voice dictation) | `expo-av` | ✓ |
| In-app purchases | `react-native-purchases` (RevenueCat, Expo plugin) | ✓ |
| Apple Sign-In | `expo-apple-authentication` | ✓ |
| Google Sign-In | `@react-native-google-signin/google-signin` (Expo plugin) | ✓ |
| File system / local cache | `expo-file-system` | ✓ |
| Camera (not needed v1) | — | — |

**Alternatives rejected**: Bare React Native — adds build complexity (Xcode/Gradle setup from scratch), complicates OTA updates, provides no benefit for this feature set.

---

## 2. State Management: Zustand

**Decision**: Zustand with one store slice per feature domain.

**Rationale**:
- ~2KB bundle; zero boilerplate compared to Redux Toolkit
- TypeScript-first: slice type is inferred from the initial state object
- No actions, no reducers, no selectors ceremony — just `set` and `get`
- Composable: each feature gets its own `useXxxStore` hook, co-located in its feature folder
- Devtools available via `zustand/middleware` if needed

**Alternatives rejected**:
- Redux Toolkit: significantly more boilerplate (slices, action creators, selectors). Correct for multi-team projects where the strict structure is enforced across engineers. Overkill for a solo-maintained app.
- React Context + useReducer: fine for simple cases but painful for cross-cutting state (e.g. entitlement state read by multiple features).

---

## 3. Local Persistence: expo-sqlite + Drizzle ORM

**Decision**: `expo-sqlite` (v2 API, async) with Drizzle ORM for type-safe queries and schema migrations.

**Rationale**:
- `expo-sqlite` v2 is async, available in Expo managed workflow, stable
- Drizzle ORM provides TypeScript schema definitions that generate both the migration SQL and the query types — one source of truth
- Schema mirrors the Supabase schema for the synced tables (dreams, interpretations, media, recurrence_patterns), simplifying the sync layer
- No SQLCipher needed (see §10 for encryption tradeoff resolution)

**Alternatives rejected**:
- WatermelonDB: better built-in sync primitives but higher setup complexity, heavier, and the sync layer is custom regardless. Not worth the overhead for a solo dev.
- AsyncStorage: key-value only, cannot express relational dreams → interpretations → media.
- In-memory only: disqualified by spec FR-006 (offline save must survive app restart).

---

## 4. Backend: Supabase

**Decision**: Supabase (PostgreSQL + Auth + Storage + Edge Functions + PostgREST + Realtime).

**Rationale for solo developer**:

| Concern | Supabase answer |
|---|---|
| Auth (email + Google + Apple OAuth) | Supabase Auth with PKCE flow |
| CRUD REST API | PostgREST auto-generated from schema |
| Server-side entitlement enforcement | Row-level security (RLS) policies on all tables |
| AI job orchestration | Deno Edge Functions |
| Media storage + CDN | Supabase Storage (S3-backed) with built-in CDN |
| Versioned system prompts | `system_prompts` table in PostgreSQL |
| Recurrence on-write | PostgreSQL function triggered on interpretation INSERT |
| Maintenance burden | Fully managed, one dashboard, one provider |
| Cost | Free tier for development; Pro $25/month for production |

**Alternatives rejected**:
- Firebase: Firestore's document model ill-suited for relational dreams → interpretations → media; Firestore query limitations complicate recurrence detection; more expensive at scale.
- Custom Node.js/NestJS: Maximum control, maximum maintenance burden. No ops team. Wrong choice for a solo dev.

---

## 5. AI Text Interpretation: Anthropic claude-sonnet-4-6

**Decision**: `claude-sonnet-4-6` via Anthropic API, called from a Supabase Edge Function, using the `tool_use` API to enforce structured output.

**Rationale**:
- Developer familiarity; strong instruction following for non-clinical framing constraint
- `tool_use` returns a validated JSON object — no free-text parsing, no regex
- claude-sonnet-4-6: faster and cheaper than Opus, fully capable for structured interpretation (~$3/M input, ~$15/M output tokens)
- The `confidence` field in the tool schema drives the degraded-state detection (constitution IV)
- API supports system prompt injection (the versioned base prompt is fetched from DB and injected as the `system` message at call time)
- Anthropic's current API usage policy: submitted content is not used for training by default ✓ (constitution III — opt-out by default)

**Structured output schema** (tool definition passed to the API):
```json
{
  "name": "format_interpretation",
  "description": "Format the dream interpretation as structured data",
  "input_schema": {
    "type": "object",
    "required": ["overall_reading", "keywords", "emotions", "cultural_references", "confidence"],
    "properties": {
      "overall_reading": {
        "type": "string",
        "description": "200-400 word symbolic and cultural reading. Non-clinical framing only."
      },
      "keywords": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 3,
        "maxItems": 10,
        "description": "Symbolic keywords extracted from the dream"
      },
      "emotions": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 1,
        "maxItems": 8,
        "description": "Emotions present or reflected in the dream"
      },
      "cultural_references": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["symbol", "tradition", "meaning"],
          "properties": {
            "symbol": { "type": "string" },
            "tradition": { "type": "string" },
            "meaning": { "type": "string" }
          }
        }
      },
      "confidence": {
        "type": "string",
        "enum": ["high", "medium", "low"],
        "description": "Model's confidence in the interpretation quality"
      }
    }
  }
}
```

**Degraded state rule**: If `tool_use` call fails (model declines, returns stop_reason other than `tool_use`, or `confidence === "low"`), the Edge Function returns `is_degraded: true` and the client renders the honest error state (constitution IV).

**Multilingual**: The base system prompt includes: *"Respond in the same language the user wrote their dream description in."* This is part of the versioned server-side base prompt (FR-010, FR-034).

---

## 6. AI Image Generation: DALL-E 3

**Decision**: DALL-E 3 via OpenAI API (`dall-e-3`, `1024×1024`, `standard` quality).

**Cost**: $0.040/image at standard quality.

**Rationale**:
- Synchronous API (10-20s response) — no async queue management needed; fits the Edge Function timeout window with a generous timeout setting
- Excellent dreamlike/surreal imagery quality
- Built-in content safety filtering (DALL-E 3 rejects unsafe prompts and returns a 400 with a content policy error) — satisfies constitution IV input+output safety requirement
- Dead-simple REST API: POST to `/v1/images/generations`, receive URL
- OpenAI API: content is not used for model training per OpenAI's data usage policy ✓

**Prompt construction**: The Edge Function constructs the image prompt by combining: dream description (truncated to ~800 chars) + top 3 symbolic keywords from the interpretation + a style modifier ("dreamlike, surreal, cinematic, watercolor illustration style").

**Cost at scale**: 3 free images/month per free user + unlimited for premium users. At $0.04 each, 1000 MAU with 3 images each = $120/month — very manageable.

**Alternatives rejected**:
- Flux 1.1 Pro (fal.ai): $0.05/image, excellent quality, but fal.ai is an additional vendor dependency with async queue — adds complexity without a significant quality advantage for this use case.
- Stable Diffusion (Replicate): $0.003-0.01/image but variable quality, requires queue management, no built-in content safety.
- Google Imagen 3: Restricted API access, no self-serve.

---

## 7. AI Video Generation: Luma Dream Machine API

**Decision**: Luma Dream Machine v2 API for premium video generation.

**Cost**: ~$0.002-0.006/second. For 5-15s videos: $0.01-$0.09/video.

**Rationale**:
- Async job API: POST → receive `generation_id` → poll status or receive webhook → download
- Strong dreamlike/cinematic quality suited for dream visualization
- Self-serve API access, no regional restrictions
- Competitive pricing for a solo dev's premium feature
- Model training opt-out available in API parameters ✓

**Architecture requirement**: This MUST be an async job, never a blocking UI wait. Implementation:
1. Client submits video generation request → Edge Function creates `generation_jobs` row + calls Luma API → returns `job_id` to client
2. Edge Function polls or receives Luma webhook → updates `generation_jobs.status`
3. On completion: uploads video to Supabase Storage → updates `media` row → sends push notification to user
4. Client shows "Generating your video... we'll notify you when it's ready" state

**Alternatives rejected**:
- Runway Gen-3 Alpha Turbo: $0.05/10s clip (~$0.005/s), slightly more expensive; API is solid but Luma's quality for dreamlike imagery is comparable or better
- Kling: Requires Chinese payment account; complex API access for international developers
- Pika: API still maturing, limited programmatic control

---

## 8. In-App Purchases: RevenueCat

**Decision**: RevenueCat SDK (`react-native-purchases`) for cross-platform subscription management.

**Rationale**:
- Single SDK for Apple App Store (StoreKit 2) and Google Play Billing — eliminates bilateral integration
- Server-side receipt validation: RevenueCat validates receipts and never trusts the client
- Webhook to Supabase Edge Function on subscription events (new, renewal, cancellation, expiry) → updates `entitlements` table
- RevenueCat REST API available for server-side entitlement checks independent of client state
- Free up to $2.5k/month revenue, then 1% — affordable for a new app
- Expo managed workflow support via Expo plugin

**Entitlement enforcement flow**:
```
Client purchase → App Store/Play Store → RevenueCat validates → 
RevenueCat webhook → Supabase Edge Function → UPDATE entitlements SET subscription_tier = 'premium' →
RLS on premium Edge Function routes checks entitlements table (not client claim)
```

This satisfies constitution Principle VII: server-side is authoritative, client is display-only.

---

## 9. Media Storage: Supabase Storage

**Decision**: Supabase Storage with private buckets and time-limited signed URLs. Built-in CDN.

**Bucket structure**:
- `dream-media/{user_id}/{dream_id}/image.jpg` — generated images
- `dream-media/{user_id}/{dream_id}/video.mp4` — generated videos

**Access pattern**:
- Backend Edge Function writes the generated media to Supabase Storage after successful generation
- Client requests a signed URL (1h expiry) via a Supabase function when viewing an entry
- Signed URLs are cached locally alongside the cached media (cache key: `media.id`)
- When a signed URL expires, the client requests a fresh one on next open

**On-device cache**:
- `expo-file-system` caches media files in `FileSystem.cacheDirectory/morpheo/media/`
- Cache key: `{media_id}.{ext}`
- Cache limit: configurable, default 200MB; LRU eviction when limit exceeded
- Cached files survive app restart; cleared only by user (Settings → Clear Cache) or OS pressure

**Alternatives rejected**:
- AWS S3 + CloudFront: More powerful but adds AWS account management, IAM roles, CloudFront distribution — operational overhead for a solo dev. Supabase Storage is S3-backed with CDN included.
- Cloudinary: Excellent image transformation capabilities but significantly more expensive at volume; not needed for this app's use case.

---

## 10. Push Notifications: Expo Push Notification Service

**Decision**: Expo Push Notification Service (EPNS) as the intermediary for APNs (iOS) and FCM (Android).

**Two notification types**:

1. **Dream logging reminders**: Local notifications scheduled via `expo-notifications` on-device. No backend involvement. User configures time in Settings → the client schedules a daily local notification at that time.

2. **Video generation complete**: Server-initiated push. Flow:
   - User's Expo push token is stored in `profiles.push_token` (registered on app open)
   - Supabase Edge Function (triggered by video job completion) calls Expo Push API with the user's push token
   - Expo Push API routes to APNs or FCM
   - Notification: "Your dream video is ready ✨" → tapping opens the specific journal entry

**Alternatives rejected**: Firebase Cloud Messaging (FCM) directly — requires separate APNs integration for iOS, more setup. EPNS wraps both in one API call.

---

## 11. RecurrencePattern Computation: PostgreSQL On-Write Trigger

**Decision**: PostgreSQL trigger on `interpretations` table INSERT → calls a PostgreSQL function that upserts `recurrence_patterns` rows.

**Rationale**:
- Immediate user feedback: recurrence data is up-to-date as soon as the interpretation is saved
- Computation is lightweight: count occurrences of each keyword/emotion across the user's interpretations
- No cron job to maintain — the trigger fires automatically
- PostgreSQL array operations (`unnest`, `count`) efficiently compute occurrences

**Trigger logic** (pseudocode):
```sql
-- After INSERT on interpretations:
FOR each keyword IN NEW.keywords:
  UPSERT recurrence_patterns (user_id, term, term_type='keyword')
  SET occurrence_count = (SELECT count FROM interpretations WHERE user_id = NEW.user_id AND keyword = ANY(keywords))
  SET dream_ids = (SELECT array of dream_ids where this keyword appears)
  SET last_seen_at = NOW()

FOR each emotion IN NEW.emotions:
  -- Same upsert pattern
```

**Alternatives rejected**: Scheduled batch job (cron) — delayed insights, adds cron infrastructure to manage. On-write is simpler and provides immediate value.

---

## 12. SQLite Encryption Tradeoff (Constitution III)

**Issue**: Constitution III requires "Dream text and generated media MUST be encrypted at rest." SQLCipher-based application-layer SQLite encryption requires native module compilation, which forces a bare Expo workflow.

**Resolution**: Rely on OS-level full-disk encryption + app-layer lock gate.

- **iOS**: Data Protection API encrypts all app sandbox files with hardware-backed AES-256. Files in class `NSFileProtectionCompleteUnlessOpen` (iOS default for app data) are encrypted when the device is locked.
- **Android**: Full-disk encryption or file-based encryption is standard since Android 6.0; mandatory for certified devices since Android 10.
- **App lock gate**: The biometric/PIN gate (constitution III, FR-003) ensures the device is functionally locked at the app level between sessions.
- **Auth tokens**: Stored in `expo-secure-store` which uses iOS Keychain (hardware-backed) and Android Keystore — encrypted at application layer. ✓
- **Media on-device cache**: Stored in `expo-file-system` cache directory, protected by the same OS-level encryption.
- **Backend**: Supabase encrypts PostgreSQL data and Storage at rest with AES-256. ✓

**Accepted tradeoff**: Dream text in the local SQLite database is encrypted at the OS/hardware layer rather than the application layer. This is disclosed in the Complexity Tracking section of `plan.md`. It is recoverable to application-layer encryption in a future version if a bare workflow becomes necessary for other reasons.
