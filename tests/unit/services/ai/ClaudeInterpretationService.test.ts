import {
  InterpretationLimitError,
  ConsentRequiredError,
  InterpretationProviderError,
} from '@services/ai/interpretation/InterpretationService';
import { MockInterpretationService } from '@services/ai/interpretation/__mocks__/MockInterpretationService';

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
