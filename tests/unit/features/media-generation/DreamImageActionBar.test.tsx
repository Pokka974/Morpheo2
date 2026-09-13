import React from 'react';
import { render } from '@testing-library/react-native';

import { DreamImageActionBar } from '@features/media-generation/DreamImageActionBar';
import type { MediaResult } from '@services/ai/image/ImageGenerationService';

const FAILED_MEDIA: MediaResult = {
  id: 'media-001',
  dreamId: 'dream-001',
  mediaType: 'image',
  generationStatus: 'failed',
  signedUrl: null,
  localCachePath: null,
  errorMessage: 'stored error message',
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
};

const COMPLETE_MEDIA: MediaResult = {
  id: 'media-001',
  dreamId: 'dream-001',
  mediaType: 'image',
  generationStatus: 'complete',
  signedUrl: 'https://example.com/img.jpg',
  localCachePath: null,
  errorMessage: null,
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
};

describe('DreamImageActionBar', () => {
  it('shows a generic placeholder when there is no media and no error', () => {
    const { getByText } = render(
      <DreamImageActionBar
        media={null}
        isGenerating={false}
        canRegenerate={false}
        imagesRemaining={null}
      />
    );
    expect(getByText('No illustration yet')).toBeTruthy();
  });

  it('prioritizes the caller-supplied errorMessage over media.errorMessage', () => {
    const { getByText, queryByText } = render(
      <DreamImageActionBar
        media={FAILED_MEDIA}
        isGenerating={false}
        errorMessage="a safety block or limit reason"
        canRegenerate={false}
        imagesRemaining={null}
      />
    );
    expect(getByText('a safety block or limit reason')).toBeTruthy();
    expect(queryByText('stored error message')).toBeNull();
  });

  it('falls back to media.errorMessage when no errorMessage prop is passed', () => {
    const { getByText } = render(
      <DreamImageActionBar
        media={FAILED_MEDIA}
        isGenerating={false}
        canRegenerate={false}
        imagesRemaining={null}
      />
    );
    expect(getByText('stored error message')).toBeTruthy();
  });

  it('labels the button "Retry" once a failure reason is known, not "Generate image"', () => {
    const { getByText } = render(
      <DreamImageActionBar
        media={null}
        isGenerating={false}
        errorMessage="something went wrong"
        canRegenerate={false}
        imagesRemaining={null}
        onGenerate={jest.fn()}
      />
    );
    expect(getByText('Retry')).toBeTruthy();
  });

  it('labels the button "Generate image" when there has been no attempt yet', () => {
    const { getByText } = render(
      <DreamImageActionBar
        media={null}
        isGenerating={false}
        canRegenerate={false}
        imagesRemaining={null}
        onGenerate={jest.fn()}
      />
    );
    expect(getByText('Generate image')).toBeTruthy();
  });

  it('shows the illustrating hint while generating, ignoring any stale errorMessage', () => {
    const { getByText, queryByText } = render(
      <DreamImageActionBar
        media={null}
        isGenerating={true}
        errorMessage="a leftover error from a previous attempt"
        canRegenerate={false}
        imagesRemaining={null}
      />
    );
    expect(getByText('Illustrating your dream…')).toBeTruthy();
    expect(queryByText('a leftover error from a previous attempt')).toBeNull();
  });

  // Regenerating spends the same monthly image credit generating does — there is no
  // separate per-entry regeneration budget any more, so the button's visibility no
  // longer depends on any count carried by `media` itself.
  describe('regenerate button (entitlement-based, no per-entry budget)', () => {
    it('shows the button with the entitlement count once an image is complete', () => {
      const { getByText } = render(
        <DreamImageActionBar
          media={COMPLETE_MEDIA}
          isGenerating={false}
          canRegenerate={true}
          imagesRemaining={2}
          onRegenerate={jest.fn()}
        />
      );
      expect(getByText('Regenerate (2 left)')).toBeTruthy();
    });

    it('shows the count even when it is zero — the press itself surfaces the real limit, same as Generate', () => {
      const { getByText } = render(
        <DreamImageActionBar
          media={COMPLETE_MEDIA}
          isGenerating={false}
          canRegenerate={true}
          imagesRemaining={0}
          onRegenerate={jest.fn()}
        />
      );
      expect(getByText('Regenerate (0 left)')).toBeTruthy();
    });

    it('shows the unlimited label with no count for a premium account', () => {
      const { getByText, queryByText } = render(
        <DreamImageActionBar
          media={COMPLETE_MEDIA}
          isGenerating={false}
          canRegenerate={true}
          imagesRemaining={null}
          onRegenerate={jest.fn()}
        />
      );
      expect(getByText('Regenerate')).toBeTruthy();
      expect(queryByText(/left/)).toBeNull();
    });

    it('does not show the button when canRegenerate is false, regardless of imagesRemaining', () => {
      const { queryByText } = render(
        <DreamImageActionBar
          media={COMPLETE_MEDIA}
          isGenerating={false}
          canRegenerate={false}
          imagesRemaining={5}
          onRegenerate={jest.fn()}
        />
      );
      expect(queryByText(/Regenerate/)).toBeNull();
    });
  });
});
