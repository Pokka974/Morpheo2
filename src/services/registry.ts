import type { InterpretationService } from './ai/interpretation/InterpretationService';
import type { ImageGenerationService } from './ai/image/ImageGenerationService';
import type { VideoGenerationService } from './ai/video/VideoGenerationService';
import type { AuthService } from './auth/AuthService';
import type { LocalLockService } from './auth/LocalLockService';
import type { StorageService } from './storage/StorageService';
import type { EntitlementService } from './entitlement/EntitlementService';
import type { NotificationService } from './notifications/NotificationService';

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
