import * as FileSystem from 'expo-file-system';
import type { StorageService } from './StorageService';

const CACHE_DIR = `${FileSystem.cacheDirectory}morpheo/media/`;
const MAX_CACHE_BYTES = 200 * 1024 * 1024;

function getFilePath(mediaId: string): string {
  const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${CACHE_DIR}${safeId}`;
}

async function ensureCacheDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export class ExpoStorageService implements StorageService {
  async cacheMedia(mediaId: string, signedUrl: string): Promise<string> {
    await ensureCacheDir();
    const path = getFilePath(mediaId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.downloadAsync(signedUrl, path);
      await this.evictToLimit(MAX_CACHE_BYTES);
    }
    return path;
  }

  async isCached(mediaId: string): Promise<boolean> {
    const path = getFilePath(mediaId);
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  }

  async getLocalUri(mediaId: string): Promise<string | null> {
    const cached = await this.isCached(mediaId);
    return cached ? getFilePath(mediaId) : null;
  }

  async evictToLimit(limitBytes: number): Promise<void> {
    await ensureCacheDir();
    const readdir = await FileSystem.readDirectoryAsync(CACHE_DIR);
    const files: Array<{ path: string; modificationTime: number; size: number }> = [];

    for (const name of readdir) {
      const path = `${CACHE_DIR}${name}`;
      const info = await FileSystem.getInfoAsync(path, { size: true, md5: false });
      if (info.exists && !info.isDirectory) {
        files.push({
          path,
          modificationTime: info.modificationTime ?? 0,
          size: info.size ?? 0,
        });
      }
    }

    // Sort oldest-first for LRU eviction
    files.sort((a, b) => a.modificationTime - b.modificationTime);

    let totalSize = files.reduce((acc, f) => acc + f.size, 0);
    for (const file of files) {
      if (totalSize <= limitBytes) break;
      await FileSystem.deleteAsync(file.path, { idempotent: true });
      totalSize -= file.size;
    }
  }

  async clearCache(): Promise<void> {
    await ensureCacheDir();
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    await Promise.all(
      files.map(name => FileSystem.deleteAsync(`${CACHE_DIR}${name}`, { idempotent: true }))
    );
  }

  async getCacheSize(): Promise<number> {
    await ensureCacheDir();
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    let total = 0;
    for (const name of files) {
      const info = await FileSystem.getInfoAsync(`${CACHE_DIR}${name}`, { size: true });
      if (info.exists && !info.isDirectory) {
        total += info.size ?? 0;
      }
    }
    return total;
  }
}
