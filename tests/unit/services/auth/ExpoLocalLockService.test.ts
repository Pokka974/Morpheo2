import { ExpoLocalLockService } from '@services/auth/ExpoLocalLockService';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const mockGetItem = SecureStore.getItem as jest.Mock;
const mockSetItem = SecureStore.setItemAsync as jest.Mock;
const mockHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
const mockAuthenticate = LocalAuthentication.authenticateAsync as jest.Mock;

describe('ExpoLocalLockService', () => {
  let service: ExpoLocalLockService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExpoLocalLockService();
  });

  describe('isConfigured', () => {
    it('returns false when no PIN stored', async () => {
      mockGetItem.mockReturnValue(null);
      expect(await service.isConfigured()).toBe(false);
    });

    it('returns true when PIN is stored', async () => {
      mockGetItem.mockReturnValue('some-hash');
      expect(await service.isConfigured()).toBe(true);
    });
  });

  describe('setupPin', () => {
    it('stores a hashed PIN and records authentication', async () => {
      mockSetItem.mockResolvedValue(undefined);
      await service.setupPin('123456');
      expect(mockSetItem).toHaveBeenCalledWith(
        'morpheo_pin_hash',
        expect.any(String)
      );
      expect(service.isLockRequired()).toBe(false);
    });
  });

  describe('getLockMethod', () => {
    it('returns biometric when hardware available and enrolled', async () => {
      mockHasHardware.mockResolvedValue(true);
      mockIsEnrolled.mockResolvedValue(true);
      expect(await service.getLockMethod()).toBe('biometric');
    });

    it('returns pin when biometric not enrolled', async () => {
      mockHasHardware.mockResolvedValue(true);
      mockIsEnrolled.mockResolvedValue(false);
      expect(await service.getLockMethod()).toBe('pin');
    });

    it('returns pin when no biometric hardware', async () => {
      mockHasHardware.mockResolvedValue(false);
      mockIsEnrolled.mockResolvedValue(false);
      expect(await service.getLockMethod()).toBe('pin');
    });
  });

  describe('authenticate', () => {
    it('returns true and records auth on biometric success', async () => {
      mockHasHardware.mockResolvedValue(true);
      mockIsEnrolled.mockResolvedValue(true);
      mockAuthenticate.mockResolvedValue({ success: true });

      const result = await service.authenticate('Unlock Morpheo');
      expect(result).toBe(true);
      expect(service.isLockRequired()).toBe(false);
    });

    it('returns false on biometric failure', async () => {
      mockHasHardware.mockResolvedValue(true);
      mockIsEnrolled.mockResolvedValue(true);
      mockAuthenticate.mockResolvedValue({ success: false, error: 'UserCancel' });

      const result = await service.authenticate('Unlock Morpheo');
      expect(result).toBe(false);
    });
  });

  describe('idle timeout', () => {
    it('requires lock when no authentication recorded', () => {
      expect(service.isLockRequired()).toBe(true);
    });

    it('does not require lock immediately after authentication', () => {
      service.recordAuthentication();
      expect(service.isLockRequired()).toBe(false);
    });

    it('requires lock after idle timeout elapses', () => {
      service.setIdleTimeoutMs(0);
      service.recordAuthentication();
      expect(service.isLockRequired()).toBe(true);
    });
  });
});
