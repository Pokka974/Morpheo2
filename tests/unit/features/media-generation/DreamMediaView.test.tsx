import React from 'react';
import { render } from '@testing-library/react-native';

import { DreamMediaView } from '@features/media-generation/DreamMediaView';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';

const FAILED_MEDIA: MediaResult = {
  id: 'media-001',
  dreamId: 'dream-001',
  mediaType: 'image',
  generationStatus: 'failed',
  signedUrl: null,
  localCachePath: null,
  regenerationCount: 0,
  maxRegenerations: 3,
  errorMessage: 'stored error message',
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
};

describe('DreamMediaView', () => {
  it('shows a generic placeholder when there is no media and no error', () => {
    const { getByText } = render(<DreamMediaView media={null} isGenerating={false} canRegenerate={false} />);
    expect(getByText('No illustration yet')).toBeTruthy();
  });

  it('prioritizes the caller-supplied errorMessage over media.errorMessage', () => {
    const { getByText, queryByText } = render(
      <DreamMediaView
        media={FAILED_MEDIA}
        isGenerating={false}
        errorMessage="a safety block or limit reason"
        canRegenerate={false}
      />
    );
    expect(getByText('a safety block or limit reason')).toBeTruthy();
    expect(queryByText('stored error message')).toBeNull();
  });

  it('falls back to media.errorMessage when no errorMessage prop is passed', () => {
    const { getByText } = render(
      <DreamMediaView media={FAILED_MEDIA} isGenerating={false} canRegenerate={false} />
    );
    expect(getByText('stored error message')).toBeTruthy();
  });

  it('labels the button "Retry" once a failure reason is known, not "Generate image"', () => {
    const { getByText } = render(
      <DreamMediaView
        media={null}
        isGenerating={false}
        errorMessage="something went wrong"
        canRegenerate={false}
        onGenerate={jest.fn()}
      />
    );
    expect(getByText('Retry')).toBeTruthy();
  });

  it('labels the button "Generate image" when there has been no attempt yet', () => {
    const { getByText } = render(
      <DreamMediaView media={null} isGenerating={false} canRegenerate={false} onGenerate={jest.fn()} />
    );
    expect(getByText('Generate image')).toBeTruthy();
  });

  it('shows the illustrating hint while generating, ignoring any stale errorMessage', () => {
    const { getByText, queryByText } = render(
      <DreamMediaView
        media={null}
        isGenerating={true}
        errorMessage="a leftover error from a previous attempt"
        canRegenerate={false}
      />
    );
    expect(getByText('Illustrating your dream…')).toBeTruthy();
    expect(queryByText('a leftover error from a previous attempt')).toBeNull();
  });
});
