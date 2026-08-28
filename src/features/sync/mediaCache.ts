import type { ServiceRegistry } from '@services/registry';

/**
 * The three capabilities the sync layer's media handling needs, narrowed to a plain
 * object.
 *
 * The sync layer runs outside the React tree and so cannot reach `useServices()`,
 * but it must still never import a concrete implementation. Passing this in keeps
 * `pullService` dependent on behaviour rather than on `ExpoStorageService` or
 * `FluxImageGenerationService`, and makes every part trivially fakeable in tests.
 */
export interface MediaCacheDeps {
  getSignedUrl(mediaId: string): Promise<string>;
  cacheMedia(mediaId: string, signedUrl: string): Promise<string>;
  /** Used when a cached file is superseded (regeneration) or the dream it belongs
   * to is purged — see `StorageService.removeCachedMedia`. */
  removeCachedMedia(mediaId: string): Promise<void>;
  /** Whether the bytes are actually on this device *right now*. A recorded
   * `local_cache_path` is not proof of that: the cache lives under the OS cache
   * directory, which iOS may purge whenever it wants and whose absolute path
   * contains an app-container id that changes when the app is reinstalled. */
  isCached(mediaId: string): Promise<boolean>;
}

export function makeMediaCache(services: ServiceRegistry): MediaCacheDeps {
  return {
    getSignedUrl: mediaId => services.imageGeneration.getSignedUrl(mediaId),
    cacheMedia: (mediaId, signedUrl) => services.storage.cacheMedia(mediaId, signedUrl),
    removeCachedMedia: mediaId => services.storage.removeCachedMedia(mediaId),
    isCached: mediaId => services.storage.isCached(mediaId),
  };
}
