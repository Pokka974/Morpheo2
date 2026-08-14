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
