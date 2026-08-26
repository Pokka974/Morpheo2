import type { ServiceRegistry } from '@services/registry';

/**
 * The two capabilities media hydration needs, narrowed to a plain object.
 *
 * The sync layer runs outside the React tree and so cannot reach `useServices()`,
 * but it must still never import a concrete implementation. Passing this in keeps
 * `pullService` dependent on behaviour rather than on `ExpoStorageService` or
 * `OpenAIImageGenerationService`, and makes both halves trivially fakeable in tests.
 */
export interface MediaCacheDeps {
  getSignedUrl(mediaId: string): Promise<string>;
  cacheMedia(mediaId: string, signedUrl: string): Promise<string>;
}

export function makeMediaCache(services: ServiceRegistry): MediaCacheDeps {
  return {
    getSignedUrl: mediaId => services.imageGeneration.getSignedUrl(mediaId),
    cacheMedia: (mediaId, signedUrl) => services.storage.cacheMedia(mediaId, signedUrl),
  };
}
