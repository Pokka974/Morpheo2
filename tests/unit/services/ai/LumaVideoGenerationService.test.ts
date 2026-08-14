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
