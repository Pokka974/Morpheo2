import type { StorageService } from '../StorageService';

export class MockStorageService implements StorageService {
  private cache = new Map<string, string>();

  async cacheMedia(mediaId: string, _signedUrl: string): Promise<string> {
    const path = `/mock-cache/${mediaId}`;
    this.cache.set(mediaId, path);
    return path;
  }

  async isCached(mediaId: string): Promise<boolean> {
    return this.cache.has(mediaId);
  }

  async getLocalUri(mediaId: string): Promise<string | null> {
    return this.cache.get(mediaId) ?? null;
  }

  async removeCachedMedia(mediaId: string): Promise<void> {
    this.cache.delete(mediaId);
  }

  async evictToLimit(_limitBytes: number): Promise<void> {
    this.cache.clear();
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  async getCacheSize(): Promise<number> {
    return this.cache.size * 1024 * 1024;
  }
}
