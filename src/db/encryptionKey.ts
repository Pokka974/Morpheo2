import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DB_ENCRYPTION_KEY_STORAGE_KEY = 'morpheo_db_encryption_key';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Sync so `src/db/client.ts` can key the database before its own synchronous
// CREATE TABLE bootstrap runs. SecureStore backs this with the iOS Keychain / Android
// Keystore, never AsyncStorage (per C2-style constraint: secrets don't belong there).
export function getOrCreateDbEncryptionKey(): string {
  const existing = SecureStore.getItem(DB_ENCRYPTION_KEY_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const key = toHex(Crypto.getRandomBytes(32));
  SecureStore.setItem(DB_ENCRYPTION_KEY_STORAGE_KEY, key);
  return key;
}
