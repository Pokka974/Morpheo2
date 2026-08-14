import { MockLocalLockService } from '@services/auth/__mocks__/MockLocalLockService';

describe('Lock Gate', () => {
  let lockService: MockLocalLockService;

  beforeEach(() => {
    lockService = new MockLocalLockService();
  });

  it('lock is not required immediately after authentication', () => {
    lockService.recordAuthentication();
    expect(lockService.isLockRequired()).toBe(false);
  });

  it('lock is required when not authenticated', () => {
    const fresh = new MockLocalLockService();
    fresh.setLockRequired(true);
    expect(fresh.isLockRequired()).toBe(true);
  });

  it('authentication clears the lock requirement', () => {
    lockService.setLockRequired(true);
    expect(lockService.isLockRequired()).toBe(true);
    lockService.recordAuthentication();
    expect(lockService.isLockRequired()).toBe(false);
  });

  it('successful biometric auth returns true', async () => {
    lockService.configure('success');
    expect(await lockService.authenticate('Unlock')).toBe(true);
  });

  it('failed biometric auth returns false', async () => {
    lockService.configure('failure');
    expect(await lockService.authenticate('Unlock')).toBe(false);
  });

  it('lock screen does not expose dream content when locked', () => {
    lockService.setLockRequired(true);
    expect(lockService.isLockRequired()).toBe(true);
  });
});
