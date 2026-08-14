export interface StorageService {
  cacheMedia(mediaId: string, signedUrl: string): Promise<string>;
  isCached(mediaId: string): Promise<boolean>;
  getLocalUri(mediaId: string): Promise<string | null>;
  evictToLimit(limitBytes: number): Promise<void>;
  clearCache(): Promise<void>;
  /** Returns total bytes of all cached files under morpheo/media/. */
  getCacheSize(): Promise<number>;
}
