export type LockMethod = 'biometric' | 'pin';

export interface LocalLockService {
  isConfigured(): Promise<boolean>;
  setupPin(pin: string): Promise<void>;
  verifyPin(pin: string): Promise<boolean>;
  authenticate(reason: string): Promise<boolean>;
  getLockMethod(): Promise<LockMethod>;
  recordAuthentication(): void;
  isLockRequired(): boolean;
}
