import { useState, useCallback, useEffect, useRef } from 'react';
import { useServices } from '@services/useServices';
import type { VideoJob } from '@services/ai/video/VideoGenerationService';
import { PremiumRequiredError } from '@services/ai/video/VideoGenerationService';
import { supabase } from '../../supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type VideoState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'processing'; job: VideoJob }
  | { status: 'complete'; job: VideoJob }
  | { status: 'failed'; message: string }
  | { status: 'premium_required' };

interface SubmitVideoParams {
  dreamId: string;
  description: string;
  keywords: string[];
}

export function useVideoGeneration() {
  const { videoGeneration } = useServices();
  const [state, setState] = useState<VideoState>({ status: 'idle' });
  const channelRef = useRef<RealtimeChannel | null>(null);

  const cleanupRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanupRealtime(), [cleanupRealtime]);

  const subscribeToJob = useCallback((jobId: string, initialJob: VideoJob) => {
    cleanupRealtime();

    const channel = supabase
      .channel(`generation_jobs:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'generation_jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          const updated = payload.new as { status: VideoJob['status']; id: string };
          const updatedJob: VideoJob = { ...initialJob, status: updated.status };
          if (updated.status === 'complete') {
            setState({ status: 'complete', job: updatedJob });
            cleanupRealtime();
          } else if (updated.status === 'failed') {
            setState({ status: 'failed', message: 'Video generation failed' });
            cleanupRealtime();
          } else {
            setState({ status: 'processing', job: updatedJob });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
  }, [cleanupRealtime]);

  const submit = useCallback(async (params: SubmitVideoParams) => {
    setState({ status: 'submitting' });
    try {
      const job = await videoGeneration.submitVideoJob(params);
      setState({ status: 'processing', job });
      subscribeToJob(job.jobId, job);
    } catch (err) {
      if (err instanceof PremiumRequiredError) {
        setState({ status: 'premium_required' });
      } else {
        setState({ status: 'failed', message: err instanceof Error ? err.message : 'Failed to submit video job' });
      }
    }
  }, [videoGeneration, subscribeToJob]);

  const reset = useCallback(() => {
    cleanupRealtime();
    setState({ status: 'idle' });
  }, [cleanupRealtime]);

  return { state, submit, reset };
}
