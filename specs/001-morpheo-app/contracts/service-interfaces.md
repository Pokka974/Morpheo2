# Service Interface Contracts: Morpheo Client Adapter Layer

**Branch**: `001-morpheo-app` | **Date**: 2026-08-14

These TypeScript interfaces define the adapter boundaries mandated by constitution Principle I.
Feature code MUST call these interfaces only. Concrete implementations (Claude, DALL-E, Luma,
Supabase Auth, etc.) live in `src/services/{domain}/` and are injected via a service registry.
Swapping a provider means replacing the concrete class — zero feature code changes.

---

## Interpretation Service

```typescript
// src/services/ai/interpretation/InterpretationService.ts

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
  /**
   * Submit a dream for AI interpretation.
   * Throws InterpretationLimitError if monthly limit exceeded.
   * Throws ConsentRequiredError if AI consent not granted.
   * Returns a degraded result (isDegraded: true) rather than throwing
   * when the AI provider returns low-quality output.
   */
  interpret(request: InterpretationRequest): Promise<InterpretationResult>;

  /**
   * Fetch an existing interpretation for a dream (from cache or backend).
   * Returns null if no interpretation exists yet.
   */
  getInterpretation(dreamId: string): Promise<InterpretationResult | null>;
}

// Error types
export class InterpretationLimitError extends Error {
  constructor(public readonly resetDate: Date) {
    super('Monthly interpretation limit reached');
  }
}

export class ConsentRequiredError extends Error {
  constructor() {
    super('AI consent must be granted before interpretation');
  }
}

export class InterpretationProviderError extends Error {
  constructor(public readonly retryable: boolean) {
    super('AI provider unavailable');
  }
}
```

---

## Image Generation Service

```typescript
// src/services/ai/image/ImageGenerationService.ts

export type GenerationStatus =
  | 'pending'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'safety_blocked';

export interface MediaResult {
  id: string;
  dreamId: string;
  mediaType: 'image' | 'video';
  generationStatus: GenerationStatus;
  signedUrl: string | null;   // null until complete
  localCachePath: string | null;
  regenerationCount: number;
  maxRegenerations: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenerationRequest {
  dreamId: string;
  description: string;
  keywords: string[];
  isRegeneration?: boolean;
}

export interface ImageGenerationService {
  /**
   * Generate (or regenerate) an image for a dream.
   * Synchronous: resolves when the image is ready or an error occurs.
   * Throws ContentSafetyError if input or output fails safety check.
   * Throws RegenerationLimitError if max regenerations reached.
   * Throws ImageLimitError if monthly free-tier limit exceeded.
   */
  generateImage(request: ImageGenerationRequest): Promise<MediaResult>;

  /**
   * Fetch the current media record for a dream (image type).
   * Returns null if no image exists yet.
   */
  getImage(dreamId: string): Promise<MediaResult | null>;

  /**
   * Get a fresh signed URL for a media asset.
   * Called when the cached signed URL has expired.
   */
  getSignedUrl(mediaId: string): Promise<string>;
}

export class ContentSafetyError extends Error {
  constructor(public readonly layer: 'input' | 'output') {
    super(`Content safety check failed at ${layer} layer`);
  }
}

export class RegenerationLimitError extends Error {
  constructor(public readonly max: number) {
    super(`Regeneration limit of ${max} reached for this entry`);
  }
}

export class ImageLimitError extends Error {
  constructor(public readonly resetDate: Date) {
    super('Monthly image generation limit reached');
  }
}
```

---

## Video Generation Service

```typescript
// src/services/ai/video/VideoGenerationService.ts

export interface VideoGenerationRequest {
  dreamId: string;
  description: string;
  keywords: string[];
  isRegeneration?: boolean;
}

export interface VideoJob {
  jobId: string;
  mediaId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  estimatedDurationSeconds: number;
}

export interface VideoGenerationService {
  /**
   * Submit a video generation job. Returns immediately with a job ID.
   * Generation is async — client subscribes to job status via the
   * Realtime channel or receives a push notification on completion.
   * Throws PremiumRequiredError if user is not on premium tier.
   * Throws ContentSafetyError if input fails safety check.
   * Throws RegenerationLimitError if max regenerations reached.
   */
  submitVideoJob(request: VideoGenerationRequest): Promise<VideoJob>;

  /**
   * Get current status of an async video generation job.
   */
  getJobStatus(jobId: string): Promise<VideoJob>;

  /**
   * Fetch the completed video media record.
   * Returns null if generation is not yet complete.
   */
  getVideo(dreamId: string): Promise<MediaResult | null>;
}

export class PremiumRequiredError extends Error {
  constructor() {
    super('Video generation requires a premium subscription');
  }
}
```

---

## Auth Service

```typescript
// src/services/auth/AuthService.ts

export interface AuthUser {
  id: string;
  email: string | null;
  provider: 'email' | 'google' | 'apple';
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  expiresAt: number; // unix timestamp
}

export interface AuthService {
  /**
   * Sign in with email and password.
   */
  signInWithEmail(email: string, password: string): Promise<AuthSession>;

  /**
   * Sign in with Google OAuth.
   */
  signInWithGoogle(): Promise<AuthSession>;

  /**
   * Sign in with Apple Sign-In.
   */
  signInWithApple(): Promise<AuthSession>;

  /**
   * Register a new user with email and password.
   */
  signUp(email: string, password: string): Promise<AuthSession>;

  /**
   * Sign out current user. Clears tokens from secure storage.
   */
  signOut(): Promise<void>;

  /**
   * Get the current session, refreshing silently if needed.
   * Returns null if the user is not authenticated.
   */
  getSession(): Promise<AuthSession | null>;

  /**
   * Listen for auth state changes (sign-in, sign-out, token refresh).
   */
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;
}
```

---

## Local Lock Service

```typescript
// src/services/auth/LocalLockService.ts

export type LockMethod = 'biometric' | 'pin';

export interface LocalLockService {
  /**
   * Check if local lock is configured.
   */
  isConfigured(): Promise<boolean>;

  /**
   * Set up a PIN (replaces or sets initial PIN).
   */
  setupPin(pin: string): Promise<void>;

  /**
   * Prompt the user to authenticate via biometric or PIN.
   * Resolves true on success, false on failure/cancellation.
   */
  authenticate(reason: string): Promise<boolean>;

  /**
   * Get the configured lock method.
   * Returns 'biometric' if enrolled biometrics available, 'pin' otherwise.
   */
  getLockMethod(): Promise<LockMethod>;

  /**
   * Record that the user has authenticated; resets the idle timer.
   */
  recordAuthentication(): void;

  /**
   * Check if the idle timeout has elapsed and re-auth is required.
   */
  isLockRequired(): boolean;
}
```

---

## Storage Service

```typescript
// src/services/storage/StorageService.ts

export interface StorageService {
  /**
   * Download and cache a media asset locally.
   * Returns the local file path.
   */
  cacheMedia(mediaId: string, signedUrl: string): Promise<string>;

  /**
   * Check if a media asset is cached locally.
   */
  isCached(mediaId: string): Promise<boolean>;

  /**
   * Get the local file URI for a cached asset.
   * Returns null if not cached.
   */
  getLocalUri(mediaId: string): Promise<string | null>;

  /**
   * Evict cached assets LRU-style to stay within the cache size limit.
   */
  evictToLimit(limitBytes: number): Promise<void>;

  /**
   * Clear all cached media.
   */
  clearCache(): Promise<void>;
}
```

---

## Entitlement Service

```typescript
// src/services/subscription/EntitlementService.ts

export interface Entitlement {
  subscriptionTier: 'free' | 'premium';
  interpretationsUsedThisMonth: number;
  monthlyInterpretationLimit: number | null; // null = unlimited
  imagesUsedThisMonth: number;
  monthlyImageLimit: number | null;
  resetDate: Date;
  subscriptionExpiresAt: Date | null;
}

export interface EntitlementService {
  /**
   * Fetch the current entitlement state from the server.
   * This is authoritative — never use client-side entitlement state as a gate.
   */
  fetchEntitlement(): Promise<Entitlement>;

  /**
   * Check if the user can perform an interpretation (has remaining credits).
   * Makes a server-side check — do not cache this result for gating decisions.
   */
  canInterpret(): Promise<boolean>;

  /**
   * Check if the user can generate an image.
   */
  canGenerateImage(): Promise<boolean>;

  /**
   * Check if the user has premium access (for video generation, full insights).
   */
  isPremium(): Promise<boolean>;

  /**
   * Present the platform-native subscription purchase UI (via RevenueCat).
   */
  purchasePremium(): Promise<{ success: boolean }>;

  /**
   * Open the platform-native subscription management screen.
   */
  manageSubscription(): Promise<void>;
}
```

---

## Notification Service

```typescript
// src/services/notifications/NotificationService.ts

export interface NotificationService {
  /**
   * Request notification permission from the OS.
   * Returns true if granted.
   */
  requestPermission(): Promise<boolean>;

  /**
   * Schedule a recurring daily local notification at the given time.
   * Replaces any existing scheduled reminder.
   */
  scheduleReminder(hour: number, minute: number): Promise<void>;

  /**
   * Cancel any scheduled daily reminder.
   */
  cancelReminder(): Promise<void>;

  /**
   * Register the device's Expo push token with the backend
   * (stored in profiles.push_token).
   */
  registerPushToken(): Promise<void>;
}
```

---

## Service Registry (Dependency Injection Root)

```typescript
// src/services/registry.ts

export interface ServiceRegistry {
  interpretation: InterpretationService;
  imageGeneration: ImageGenerationService;
  videoGeneration: VideoGenerationService;
  auth: AuthService;
  localLock: LocalLockService;
  storage: StorageService;
  entitlement: EntitlementService;
  notifications: NotificationService;
}

/**
 * The registry is initialized once at app startup and injected into
 * feature hooks via a React context. Feature code imports the hook,
 * not the concrete service classes.
 *
 * Example usage in a feature hook:
 *   const { interpretation } = useServices();
 *   const result = await interpretation.interpret({ dreamId, description, style });
 */
```
