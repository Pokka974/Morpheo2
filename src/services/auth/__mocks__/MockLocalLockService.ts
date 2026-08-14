import type { LocalLockService, LockMethod } from '../LocalLockService';

export type MockMode = 'success' | 'failure' | 'not_configured';

export class MockLocalLockService implements LocalLockService {
  private mode: MockMode = 'success';
  private _lockRequired = false;

  configure(mode: MockMode) {
    this.mode = mode;
    return this;
  }

  setLockRequired(value: boolean) {
    this._lockRequired = value;
    return this;
  }

  async isConfigured(): Promise<boolean> {
    return this.mode !== 'not_configured';
  }

  async setupPin(_pin: string): Promise<void> {}

  async verifyPin(_pin: string): Promise<boolean> {
    return this.mode === 'success';
  }

  async authenticate(_reason: string): Promise<boolean> {
    return this.mode === 'success';
  }

  async getLockMethod(): Promise<LockMethod> {
    return 'biometric';
  }

  recordAuthentication(): void {
    this._lockRequired = false;
  }

  isLockRequired(): boolean {
    return this._lockRequired;
  }
}
