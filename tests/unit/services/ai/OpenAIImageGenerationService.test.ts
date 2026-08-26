import { OpenAIImageGenerationService } from '@services/ai/image/OpenAIImageGenerationService';
import {
  ContentSafetyError,
  RegenerationLimitError,
  ImageLimitError,
  ImageGenerationProviderError,
} from '@services/ai/image/ImageGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';
import { sqlite } from '@db/client';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockStorage = new MockStorageService();

const testRequest = {
  dreamId: 'dream-001',
  description: 'I was flying over a dark ocean at night',
  keywords: ['ocean', 'night', 'flying'],
};

describe('OpenAIImageGenerationService', () => {
  let service: OpenAIImageGenerationService;

  beforeEach(() => {
    service = new OpenAIImageGenerationService(mockStorage);
    jest.clearAllMocks();
    (sqlite.runAsync as jest.Mock)
      .mockReset()
      .mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
    (sqlite.getFirstAsync as jest.Mock).mockReset().mockResolvedValue(null);
  });

  it('returns MediaResult on success', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001',
        dreamId: 'dream-001',
        mediaType: 'image',
        generationStatus: 'complete',
        signedUrl: 'https://example.com/img.jpg',
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-14T00:00:00Z',
        updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    const result = await service.generateImage(testRequest);
    expect(result.generationStatus).toBe('complete');
    expect(mockInvoke).toHaveBeenCalledWith('generate-image', { body: testRequest });
  });

  it('throws ContentSafetyError on 400 safety_blocked', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: 'safety_blocked' },
      error: { status: 400 },
    });
    await expect(service.generateImage(testRequest)).rejects.toThrow(ContentSafetyError);
  });

  it('throws RegenerationLimitError on 409 regen_limit_reached', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: 'regen_limit_reached', max: 3 },
      error: { status: 409 },
    });
    await expect(service.generateImage(testRequest)).rejects.toThrow(RegenerationLimitError);
  });

  it('throws ImageLimitError on 429', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { error: 'limit_reached', resetDate: '2026-09-01T00:00:00Z' },
      error: { status: 429 },
    });
    await expect(service.generateImage(testRequest)).rejects.toThrow(ImageLimitError);
  });

  it('throws a retryable ImageGenerationProviderError on a 503 response', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 503 } });
    try {
      await service.generateImage(testRequest);
      throw new Error('expected generateImage() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationProviderError);
      expect((e as ImageGenerationProviderError).retryable).toBe(true);
    }
  });

  it('throws a retryable ImageGenerationProviderError on a 500 response', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    try {
      await service.generateImage(testRequest);
      throw new Error('expected generateImage() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationProviderError);
      expect((e as ImageGenerationProviderError).retryable).toBe(true);
    }
  });

  it('throws a non-retryable ImageGenerationProviderError on an unrecognized error status', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 418 } });
    try {
      await service.generateImage(testRequest);
      throw new Error('expected generateImage() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ImageGenerationProviderError);
      expect((e as ImageGenerationProviderError).retryable).toBe(false);
    }
  });

  it('returns the plain result (no localCachePath) when caching throws', async () => {
    jest.spyOn(mockStorage, 'cacheMedia').mockRejectedValueOnce(new Error('disk full'));
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001',
        dreamId: 'dream-001',
        mediaType: 'image',
        generationStatus: 'complete',
        signedUrl: 'https://example.com/img.jpg',
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-14T00:00:00Z',
        updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    const result = await service.generateImage(testRequest);
    expect(result.localCachePath).toBeNull();
  });

  it('does not attempt caching when generationStatus is not complete', async () => {
    const cacheSpy = jest.spyOn(mockStorage, 'cacheMedia');
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001',
        dreamId: 'dream-001',
        mediaType: 'image',
        generationStatus: 'processing',
        signedUrl: null,
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-14T00:00:00Z',
        updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    await service.generateImage(testRequest);
    expect(cacheSpy).not.toHaveBeenCalled();
  });

  it('mirrors a successful generation into the local media table, keyed by media id', async () => {
    jest.spyOn(mockStorage, 'cacheMedia').mockResolvedValueOnce('/local/path/img.jpg');
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001',
        dreamId: 'dream-001',
        mediaType: 'image',
        generationStatus: 'complete',
        signedUrl: 'https://example.com/img.jpg',
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-14T00:00:00Z',
        updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    await service.generateImage(testRequest);

    expect(sqlite.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO media'), [
      'media-001',
      'dream-001',
      'image',
      'complete',
      '/local/path/img.jpg',
      0,
      3,
      null,
      '2026-08-14T00:00:00Z',
      '2026-08-14T00:00:00Z',
    ]);
  });

  it('does not let a local persistence failure surface as a generateImage() rejection', async () => {
    jest.spyOn(mockStorage, 'cacheMedia').mockResolvedValueOnce('/local/path/img.jpg');
    (sqlite.runAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001',
        dreamId: 'dream-001',
        mediaType: 'image',
        generationStatus: 'complete',
        signedUrl: 'https://example.com/img.jpg',
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-14T00:00:00Z',
        updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    const result = await service.generateImage(testRequest);
    expect(result.localCachePath).toBe('/local/path/img.jpg');
  });

  describe('getImage', () => {
    it('returns the local row when the device already has one, without querying Supabase', async () => {
      (sqlite.getFirstAsync as jest.Mock).mockResolvedValueOnce({
        id: 'media-001',
        dream_id: 'dream-001',
        media_type: 'image',
        generation_status: 'complete',
        local_cache_path: '/local/path/img.jpg',
        regeneration_count: 0,
        max_regenerations: 3,
        error_message: null,
        created_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z',
      });

      const result = await service.getImage('dream-001');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'media-001',
          dreamId: 'dream-001',
          localCachePath: '/local/path/img.jpg',
        })
      );
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('maps a found row to a MediaResult', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: {
          id: 'media-001',
          dream_id: 'dream-001',
          media_type: 'image',
          generation_status: 'complete',
          regeneration_count: 0,
          max_regenerations: 3,
          error_message: null,
          created_at: '2026-08-14T00:00:00Z',
          updated_at: '2026-08-14T00:00:00Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit,
        maybeSingle: mockMaybeSingle,
      });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });

      const result = await service.getImage('dream-001');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'media-001',
          dreamId: 'dream-001',
          mediaType: 'image',
          generationStatus: 'complete',
        })
      );
    });

    // A device that synced a dream someone else's device generated the image for has
    // the media row (storage_key and all) but no file behind it, since local_cache_path
    // never leaves the device that wrote it. Without a signed-URL fallback the detail
    // screen renders blank until the sync layer's hydration pass catches up.
    it('falls back to a signed URL when the synced local row has no cached file yet', async () => {
      (sqlite.getFirstAsync as jest.Mock).mockResolvedValue({
        id: 'media-001',
        dream_id: 'dream-001',
        media_type: 'image',
        generation_status: 'complete',
        local_cache_path: null,
        regeneration_count: 0,
        max_regenerations: 3,
        error_message: null,
        created_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z',
      });
      mockInvoke.mockResolvedValueOnce({
        data: { signedUrl: 'https://example.com/signed.png' },
        error: null,
      });

      const result = await service.getImage('dream-001');

      expect(mockInvoke).toHaveBeenCalledWith('media-url', { body: { mediaId: 'media-001' } });
      expect(result).toEqual(
        expect.objectContaining({ signedUrl: 'https://example.com/signed.png' })
      );
    });

    it('does not sign a row that already has a cached file, so an offline read stays offline', async () => {
      (sqlite.getFirstAsync as jest.Mock).mockResolvedValue({
        id: 'media-001',
        dream_id: 'dream-001',
        media_type: 'image',
        generation_status: 'complete',
        local_cache_path: '/local/path/img.jpg',
        regeneration_count: 0,
        max_regenerations: 3,
        error_message: null,
        created_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z',
      });

      await service.getImage('dream-001');

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('does not sign a row that has no object behind it yet', async () => {
      (sqlite.getFirstAsync as jest.Mock).mockResolvedValue({
        id: 'media-001',
        dream_id: 'dream-001',
        media_type: 'image',
        generation_status: 'processing',
        local_cache_path: null,
        regeneration_count: 0,
        max_regenerations: 3,
        error_message: null,
        created_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z',
      });

      await service.getImage('dream-001');

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('still returns the media when signing fails, rather than failing the whole read', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (sqlite.getFirstAsync as jest.Mock).mockResolvedValue({
        id: 'media-001',
        dream_id: 'dream-001',
        media_type: 'image',
        generation_status: 'complete',
        local_cache_path: null,
        regeneration_count: 0,
        max_regenerations: 3,
        error_message: null,
        created_at: '2026-08-14T00:00:00Z',
        updated_at: '2026-08-14T00:00:00Z',
      });
      mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

      const result = await service.getImage('dream-001');

      expect(result).toEqual(expect.objectContaining({ id: 'media-001', signedUrl: null }));
      consoleErrorSpy.mockRestore();
    });

    it('returns null (not a thrown PGRST116 error) when the dream has no image media yet', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      // maybeSingle() resolves 0 rows as { data: null, error: null }, unlike single()
      // which would surface a PGRST116 error — this is the regression this test guards.
      const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        order: mockOrder,
        limit: mockLimit,
        maybeSingle: mockMaybeSingle,
      });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });

      await expect(service.getImage('dream-001')).resolves.toBeNull();
    });
  });

  describe('getSignedUrl', () => {
    it('returns the signed URL on success', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { signedUrl: 'https://example.com/signed.jpg' },
        error: null,
      });
      const url = await service.getSignedUrl('media-001');
      expect(url).toBe('https://example.com/signed.jpg');
      expect(mockInvoke).toHaveBeenCalledWith('media-url', { body: { mediaId: 'media-001' } });
    });

    it('throws when the function errors', async () => {
      mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
      await expect(service.getSignedUrl('media-001')).rejects.toThrow('Failed to get signed URL');
    });

    it('throws when there is no data', async () => {
      mockInvoke.mockResolvedValueOnce({ data: null, error: null });
      await expect(service.getSignedUrl('media-001')).rejects.toThrow('Failed to get signed URL');
    });

    it('carries the underlying invoke error as the cause', async () => {
      const invokeError = { message: 'Function not found' };
      mockInvoke.mockResolvedValueOnce({ data: null, error: invokeError });
      await expect(service.getSignedUrl('media-001')).rejects.toMatchObject({
        cause: invokeError,
      });
    });

    // A 2xx whose body was parsed as text (no JSON content-type) yields a truthy
    // `data` with no `signedUrl` — it must fail loudly rather than return undefined.
    it('throws when the response carries no signedUrl', async () => {
      mockInvoke.mockResolvedValueOnce({ data: '{"signedUrl":"x"}', error: null });
      await expect(service.getSignedUrl('media-001')).rejects.toThrow('Failed to get signed URL');
    });
  });

  it('caches image locally when signedUrl is present and status is complete', async () => {
    jest.spyOn(mockStorage, 'cacheMedia').mockResolvedValueOnce('/local/path/img.jpg');
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001',
        dreamId: 'dream-001',
        mediaType: 'image',
        generationStatus: 'complete',
        signedUrl: 'https://example.com/img.jpg',
        localCachePath: null,
        regenerationCount: 0,
        maxRegenerations: 3,
        errorMessage: null,
        createdAt: '2026-08-14T00:00:00Z',
        updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    const result = await service.generateImage(testRequest);
    expect(mockStorage.cacheMedia).toHaveBeenCalledWith('media-001', 'https://example.com/img.jpg');
    expect(result.localCachePath).toBe('/local/path/img.jpg');
  });
});
