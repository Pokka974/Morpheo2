import { makeMediaCache } from '@features/sync/mediaCache';
import type { ServiceRegistry } from '@services/registry';

describe('makeMediaCache', () => {
  const getSignedUrl = jest.fn().mockResolvedValue('https://example.com/signed.png');
  const cacheMedia = jest.fn().mockResolvedValue('/local/media/media-1.png');

  // Only the two members the adapter reads; the rest of the registry is irrelevant
  // here and standing it up would only couple this test to unrelated services.
  const services = {
    imageGeneration: { getSignedUrl },
    storage: { cacheMedia },
  } as unknown as ServiceRegistry;

  beforeEach(() => {
    getSignedUrl.mockClear();
    cacheMedia.mockClear();
  });

  it('delegates signing to the image generation service', async () => {
    await expect(makeMediaCache(services).getSignedUrl('media-1')).resolves.toBe(
      'https://example.com/signed.png'
    );
    expect(getSignedUrl).toHaveBeenCalledWith('media-1');
  });

  it('delegates caching to the storage service', async () => {
    await expect(
      makeMediaCache(services).cacheMedia('media-1', 'https://example.com/signed.png')
    ).resolves.toBe('/local/media/media-1.png');
    expect(cacheMedia).toHaveBeenCalledWith('media-1', 'https://example.com/signed.png');
  });
});
