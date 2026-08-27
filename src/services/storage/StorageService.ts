export interface StorageService {
  cacheMedia(mediaId: string, signedUrl: string): Promise<string>;
  isCached(mediaId: string): Promise<boolean>;
  getLocalUri(mediaId: string): Promise<string | null>;
  /**
   * Drops one media file from the cache. The cache filename is derived from the
   * media id, so a row whose image changed underneath it (a regeneration keeps its
   * id) or a dream that was deleted outright would otherwise keep serving — or
   * simply keep occupying — the superseded bytes: `cacheMedia` short-circuits on
   * an existing file and never re-downloads. Idempotent; a missing file is a no-op.
   */
  removeCachedMedia(mediaId: string): Promise<void>;
  evictToLimit(limitBytes: number): Promise<void>;
  clearCache(): Promise<void>;
  /** Returns total bytes of all cached files under morpheo/media/. */
  getCacheSize(): Promise<number>;
}
