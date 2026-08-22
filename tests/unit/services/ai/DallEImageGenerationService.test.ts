import { DallEImageGenerationService } from '@services/ai/image/DallEImageGenerationService';
import { ContentSafetyError, RegenerationLimitError, ImageLimitError } from '@services/ai/image/ImageGenerationService';
import { MockStorageService } from '@services/storage/__mocks__/MockStorageService';

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

describe('DallEImageGenerationService', () => {
  let service: DallEImageGenerationService;

  beforeEach(() => {
    service = new DallEImageGenerationService(mockStorage);
    jest.clearAllMocks();
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

  it('rethrows the raw error for an unrecognized error status', async () => {
    const rawError = { status: 500, message: 'server error' };
    mockInvoke.mockResolvedValueOnce({ data: null, error: rawError });
    await expect(service.generateImage(testRequest)).rejects.toEqual(rawError);
  });

  it('returns the plain result (no localCachePath) when caching throws', async () => {
    jest.spyOn(mockStorage, 'cacheMedia').mockRejectedValueOnce(new Error('disk full'));
    mockInvoke.mockResolvedValueOnce({
      data: {
        id: 'media-001', dreamId: 'dream-001', mediaType: 'image', generationStatus: 'complete',
        signedUrl: 'https://example.com/img.jpg', localCachePath: null, regenerationCount: 0,
        maxRegenerations: 3, errorMessage: null, createdAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z',
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
        id: 'media-001', dreamId: 'dream-001', mediaType: 'image', generationStatus: 'processing',
        signedUrl: null, localCachePath: null, regenerationCount: 0,
        maxRegenerations: 3, errorMessage: null, createdAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z',
      },
      error: null,
    });

    await service.generateImage(testRequest);
    expect(cacheSpy).not.toHaveBeenCalled();
  });

  describe('getImage', () => {
    it('maps a found row to a MediaResult', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({
        data: {
          id: 'media-001', dream_id: 'dream-001', media_type: 'image', generation_status: 'complete',
          regeneration_count: 0, max_regenerations: 3, error_message: null,
          created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:00:00Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, order: mockOrder, limit: mockLimit, single: mockSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ single: mockSingle });

      const result = await service.getImage('dream-001');
      expect(result).toEqual(
        expect.objectContaining({ id: 'media-001', dreamId: 'dream-001', mediaType: 'image', generationStatus: 'complete' })
      );
    });

    it('returns null when no row is found', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, order: mockOrder, limit: mockLimit, single: mockSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ single: mockSingle });

      const result = await service.getImage('dream-001');
      expect(result).toBeNull();
    });
  });

  describe('getSignedUrl', () => {
    it('returns the signed URL on success', async () => {
      mockInvoke.mockResolvedValueOnce({ data: { signedUrl: 'https://example.com/signed.jpg' }, error: null });
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
