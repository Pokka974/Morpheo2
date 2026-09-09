jest.mock('expo-secure-store', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { getOrCreateDbEncryptionKey } from '@db/encryptionKey';

const mockGetItem = SecureStore.getItem as jest.Mock;
const mockSetItem = SecureStore.setItem as jest.Mock;
const mockGetRandomBytes = Crypto.getRandomBytes as jest.Mock;

describe('getOrCreateDbEncryptionKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses the key already stored in SecureStore instead of generating a new one', () => {
    mockGetItem.mockReturnValue('deadbeef');

    const key = getOrCreateDbEncryptionKey();

    expect(key).toBe('deadbeef');
    expect(mockGetRandomBytes).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('generates a 32-byte hex key and persists it via SecureStore when none exists yet', () => {
    mockGetItem.mockReturnValue(null);
    mockGetRandomBytes.mockReturnValue(new Uint8Array(32).fill(0xab));

    const key = getOrCreateDbEncryptionKey();

    expect(key).toBe('ab'.repeat(32));
    expect(key).toHaveLength(64);
    expect(mockSetItem).toHaveBeenCalledWith('morpheo_db_encryption_key', 'ab'.repeat(32));
  });
});
