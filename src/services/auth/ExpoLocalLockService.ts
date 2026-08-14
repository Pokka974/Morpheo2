import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import type { LocalLockService, LockMethod } from './LocalLockService';

const PIN_KEY = 'morpheo_pin_hash';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 5;

function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36) + '_' + pin.length.toString();
}

export class ExpoLocalLockService implements LocalLockService {
  private lastAuthAt: number | null = null;
  private idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MINUTES * 60 * 1000;

  setIdleTimeoutMs(ms: number) {
    this.idleTimeoutMs = ms;
  }

  async isConfigured(): Promise<boolean> {
    const pin = SecureStore.getItem(PIN_KEY);
    return pin !== null;
  }

  async setupPin(pin: string): Promise<void> {
    const hash = hashPin(pin);
    await SecureStore.setItemAsync(PIN_KEY, hash);
    this.recordAuthentication();
  }

  async verifyPin(pin: string): Promise<boolean> {
    const stored = SecureStore.getItem(PIN_KEY);
    if (!stored) return false;
    const matches = hashPin(pin) === stored;
    if (matches) this.recordAuthentication();
    return matches;
  }

  async authenticate(reason: string): Promise<boolean> {
    const biometricAvailable = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (biometricAvailable && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });
      if (result.success) {
        this.recordAuthentication();
        return true;
      }
    }
    return false;
  }

  async getLockMethod(): Promise<LockMethod> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled ? 'biometric' : 'pin';
  }

  recordAuthentication(): void {
    this.lastAuthAt = Date.now();
  }

  isLockRequired(): boolean {
    if (this.lastAuthAt === null) return true;
    return Date.now() - this.lastAuthAt >= this.idleTimeoutMs;
  }
}
