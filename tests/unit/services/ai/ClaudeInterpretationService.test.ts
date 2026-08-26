import {
  InterpretationLimitError,
  ConsentRequiredError,
  InterpretationProviderError,
} from '@services/ai/interpretation/InterpretationService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// Import after the mock so the real class picks up the mocked supabase client.
import { ClaudeInterpretationService } from '@services/ai/interpretation/ClaudeInterpretationService';

const testRequest = {
  dreamId: 'dream-001',
  description: 'A long dream description here.',
  style: 'symbolic' as const,
};

describe('ClaudeInterpretationService (real class, mocked supabase)', () => {
  let service: ClaudeInterpretationService;

  beforeEach(() => {
    service = new ClaudeInterpretationService();
    jest.clearAllMocks();
  });

  it('returns the InterpretationResult on success', async () => {
    const result = {
      id: 'interp-1',
      dreamId: 'dream-001',
      overallReading: 'A reading.',
      keywords: ['a'],
      emotions: ['calm'],
      culturalReferences: [],
      confidence: 'high',
      isDegraded: false,
      promptVersion: 'v1',
      modelUsed: 'claude-haiku-4-5',
      createdAt: '2026-08-14T00:00:00Z',
    };
    mockInvoke.mockResolvedValueOnce({ data: result, error: null });

    const returned = await service.interpret(testRequest);
    expect(returned).toEqual(result);
    expect(mockInvoke).toHaveBeenCalledWith('interpret', { body: testRequest });
  });

  it('throws ConsentRequiredError on a 403 response', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 403 } });
    await expect(service.interpret(testRequest)).rejects.toThrow(ConsentRequiredError);
  });

  it('throws InterpretationLimitError with resetDate on a 429 response', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { resetDate: '2026-09-01T00:00:00Z' },
      error: { status: 429 },
    });
    await expect(service.interpret(testRequest)).rejects.toThrow(InterpretationLimitError);
  });

  it('falls back to a 30-day resetDate on 429 when the response has none', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    try {
      await service.interpret(testRequest);
      throw new Error('expected interpret() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InterpretationLimitError);
      expect((e as InterpretationLimitError).resetDate.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('throws a retryable InterpretationProviderError on a 503 response', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 503 } });
    try {
      await service.interpret(testRequest);
      throw new Error('expected interpret() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InterpretationProviderError);
      expect((e as InterpretationProviderError).retryable).toBe(true);
    }
  });

  it('throws a retryable InterpretationProviderError on a 500 response', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 500 } });
    try {
      await service.interpret(testRequest);
      throw new Error('expected interpret() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InterpretationProviderError);
      expect((e as InterpretationProviderError).retryable).toBe(true);
    }
  });

  it('throws a non-retryable InterpretationProviderError on an unrecognized error status', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: { status: 418 } });
    try {
      await service.interpret(testRequest);
      throw new Error('expected interpret() to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(InterpretationProviderError);
      expect((e as InterpretationProviderError).retryable).toBe(false);
    }
  });

  it('getInterpretation maps a row to an InterpretationResult, defaulting missing arrays', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        id: 'interp-1',
        dream_id: 'dream-001',
        overall_reading: 'A reading.',
        keywords: null,
        emotions: null,
        cultural_references: null,
        confidence: 'medium',
        is_degraded: false,
        prompt_version: 'v1',
        model_used: 'claude-haiku-4-5',
        created_at: '2026-08-14T00:00:00Z',
      },
      error: null,
    });
    const limit = jest.fn(() => ({ maybeSingle }));
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValueOnce({ select });

    const result = await service.getInterpretation('dream-001');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'interp-1',
        dreamId: 'dream-001',
        keywords: [],
        emotions: [],
        culturalReferences: [],
      })
    );
  });

  it('getInterpretation returns null when the query errors', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const limit = jest.fn(() => ({ maybeSingle }));
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValueOnce({ select });

    const result = await service.getInterpretation('dream-001');
    expect(result).toBeNull();
  });

  it('getInterpretation returns null (not a thrown PGRST116 error) when the dream has no interpretation yet', async () => {
    // maybeSingle() resolves 0 rows as { data: null, error: null }, unlike single()
    // which would surface a PGRST116 error — this is the regression this test guards.
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const limit = jest.fn(() => ({ maybeSingle }));
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValueOnce({ select });

    await expect(service.getInterpretation('dream-001')).resolves.toBeNull();
  });
});

// ClaudeInterpretationService requires live Supabase + Anthropic.
// Unit tests validate the contract via MockInterpretationService.

describe('InterpretationService contract (via mock)', () => {
  let service: MockInterpretationService;

  beforeEach(() => {
    service = new MockInterpretationService();
  });

  it('success mode returns InterpretationResult with all fields', async () => {
    service.configure('success');
    const result = await service.interpret({ dreamId: 'test-id', description: 'A long dream description here.', style: 'symbolic' });
    expect(result.overallReading).toBeTruthy();
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(Array.isArray(result.emotions)).toBe(true);
    expect(Array.isArray(result.culturalReferences)).toBe(true);
    expect(result.isDegraded).toBe(false);
    expect(result.dreamId).toBe('test-id');
  });

  it('degraded mode returns result with isDegraded=true', async () => {
    service.configure('degraded');
    const result = await service.interpret({ dreamId: 'test-id', description: 'Short dream.', style: 'symbolic' });
    expect(result.isDegraded).toBe(true);
    expect(result.confidence).toBe('low');
  });

  it('failure mode throws InterpretationProviderError', async () => {
    service.configure('failure');
    await expect(
      service.interpret({ dreamId: 'test-id', description: 'A dream.', style: 'symbolic' })
    ).rejects.toThrow(InterpretationProviderError);
  });

  it('limit_exceeded mode throws InterpretationLimitError with resetDate', async () => {
    service.configure('limit_exceeded');
    await expect(
      service.interpret({ dreamId: 'test-id', description: 'A dream.', style: 'symbolic' })
    ).rejects.toThrow(InterpretationLimitError);
  });

  it('consent_required mode throws ConsentRequiredError', async () => {
    service.configure('consent_required');
    await expect(
      service.interpret({ dreamId: 'test-id', description: 'A dream.', style: 'symbolic' })
    ).rejects.toThrow(ConsentRequiredError);
  });

  it('getInterpretation returns null in failure mode', async () => {
    service.configure('failure');
    const result = await service.getInterpretation('test-id');
    expect(result).toBeNull();
  });
});
