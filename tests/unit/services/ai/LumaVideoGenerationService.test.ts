import { LumaVideoGenerationService } from '@services/ai/video/LumaVideoGenerationService';
import { PremiumRequiredError } from '@services/ai/video/VideoGenerationService';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('@services/../supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const testRequest = {
  dreamId: 'dream-001',
  description: 'Floating through a cosmic nebula',
  keywords: ['space', 'nebula', 'float'],
};

describe('LumaVideoGenerationService', () => {
  let service: LumaVideoGenerationService;

  beforeEach(() => {
    service = new LumaVideoGenerationService();
    jest.clearAllMocks();
  });

  describe('submitVideoJob', () => {
    it('returns VideoJob on success', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { jobId: 'job-001', mediaId: 'media-001', status: 'queued', estimatedDurationSeconds: 120 },
        error: null,
      });

      const job = await service.submitVideoJob(testRequest);
      expect(job.status).toBe('queued');
      expect(job.estimatedDurationSeconds).toBe(120);
      expect(mockInvoke).toHaveBeenCalledWith('generate-video', { body: testRequest });
    });

    it('throws PremiumRequiredError on 403 premium_required', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'premium_required' },
        error: { status: 403 },
      });

      await expect(service.submitVideoJob(testRequest)).rejects.toThrow(PremiumRequiredError);
    });

    it('rethrows the raw error for a 403 that is not premium_required', async () => {
      const rawError = { status: 403, message: 'some other 403' };
      mockInvoke.mockResolvedValueOnce({ data: { error: 'other' }, error: rawError });

      await expect(service.submitVideoJob(testRequest)).rejects.toEqual(rawError);
    });

    it('rethrows the raw error for a non-403 failure', async () => {
      const rawError = { status: 500, message: 'server error' };
      mockInvoke.mockResolvedValueOnce({ data: null, error: rawError });

      await expect(service.submitVideoJob(testRequest)).rejects.toEqual(rawError);
    });
  });

  describe('getJobStatus', () => {
    it('queries generation_jobs table by jobId', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({
        data: { id: 'job-001', status: 'processing', media_id: 'media-001', estimated_duration_seconds: 120 },
        error: null,
      });

      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ single: mockSingle });

      const job = await service.getJobStatus('job-001');
      expect(job.status).toBe('processing');
      expect(job.jobId).toBe('job-001');
    });

    it('throws when job not found', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });

      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, single: mockSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ single: mockSingle });

      await expect(service.getJobStatus('bad-job')).rejects.toThrow('not found');
    });
  });

  describe('getVideo', () => {
    it('maps a found row to a MediaResult', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: {
          id: 'media-001',
          dream_id: 'dream-001',
          generation_status: 'complete',
          regeneration_count: 0,
          max_regenerations: 1,
          error_message: null,
          created_at: '2026-08-14T00:00:00Z',
          updated_at: '2026-08-14T00:00:00Z',
        },
        error: null,
      });

      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, order: mockOrder, limit: mockLimit, maybeSingle: mockMaybeSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });

      const result = await service.getVideo('dream-001');
      expect(result).toEqual(
        expect.objectContaining({ id: 'media-001', dreamId: 'dream-001', mediaType: 'video', generationStatus: 'complete' })
      );
    });

    it('returns null when the query errors', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });

      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, order: mockOrder, limit: mockLimit, maybeSingle: mockMaybeSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });

      const result = await service.getVideo('dream-001');
      expect(result).toBeNull();
    });

    it('returns null (not a thrown PGRST116 error) when the dream has no video media yet', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockEq = jest.fn().mockReturnThis();
      const mockOrder = jest.fn().mockReturnThis();
      const mockLimit = jest.fn().mockReturnThis();
      // maybeSingle() resolves 0 rows as { data: null, error: null }, unlike single()
      // which would surface a PGRST116 error — this is the regression this test guards.
      const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

      mockFrom.mockReturnValue({ select: mockSelect, eq: mockEq, order: mockOrder, limit: mockLimit, maybeSingle: mockMaybeSingle });
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ eq: mockEq, order: mockOrder });
      mockOrder.mockReturnValue({ limit: mockLimit });
      mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle });

      await expect(service.getVideo('dream-001')).resolves.toBeNull();
    });
  });
});

describe('generate-video Edge Function do_not_train assertion', () => {
  it('confirms the generate-video Edge Function includes do_not_train: true in Luma request', async () => {
    // The generate-video/index.ts Edge Function MUST include { "do_not_train": true }
    // per Morpheo Constitution Principle III.
    // This test documents and enforces that requirement.
    const edgeFunctionPath = require('path').resolve(
      __dirname,
      '../../../../supabase/functions/generate-video/index.ts'
    );
    const fs = require('fs');
    const source = fs.readFileSync(edgeFunctionPath, 'utf8');
    expect(source).toContain('do_not_train: true');
  });
});
