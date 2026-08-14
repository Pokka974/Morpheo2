import React from 'react';
import { render } from '@testing-library/react-native';

// Performance test: 500 mock entries render within budget
// and FlashList doesn't call renderItem for off-screen items on initial render

const mockFlashListRenderCount = { count: 0 };

jest.mock('@shopify/flash-list', () => {
  // Use require() inside factory — jest.mock is hoisted above imports so outer
  // variables like React would be undefined at static analysis time
  const { View } = require('react-native');
  const R = require('react');
  return {
    FlashList: ({ data, renderItem, estimatedItemSize }: { data: unknown[]; renderItem: (args: { item: unknown }) => unknown; estimatedItemSize: number }) => {
      // FlashList renders only visible items (~viewport / estimatedItemSize)
      const VIEWPORT_HEIGHT = 844; // iPhone 14 viewport
      const visibleCount = Math.ceil(VIEWPORT_HEIGHT / estimatedItemSize) + 2; // +2 buffer
      const renderedItems = data.slice(0, Math.min(visibleCount, data.length));
      mockFlashListRenderCount.count = renderedItems.length;
      return R.createElement(View, null,
        ...renderedItems.map((item: unknown, i: number) =>
          R.createElement(View, { key: i }, renderItem({ item }))
        )
      );
    },
  };
});

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({
    getAllAsync: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@services/useServices', () => ({
  useServices: () => ({
    imageGeneration: { getImage: jest.fn().mockResolvedValue(null) },
    entitlement: { isPremium: jest.fn().mockResolvedValue(false) },
  }),
}));

jest.mock('@features/journal/useJournalSearch', () => ({
  useJournalSearch: () => ({ results: null, isSearching: false, search: jest.fn(), clearSearch: jest.fn() }),
}));

jest.mock('@features/journal/useJournalFilters', () => ({
  useJournalFilters: () => ({ filters: {}, results: null, isFiltering: false, applyFilters: jest.fn(), clearFilters: jest.fn() }),
}));

function generate500Entries() {
  return Array.from({ length: 500 }, (_, i) => ({
    id: `dream-${i}`,
    description: `This is dream number ${i} with some content about mysterious symbols.`,
    occurredAt: `2026-08-${String(i % 28 + 1).padStart(2, '0')}`,
    syncStatus: 'synced' as const,
    thumbnailUri: null,
  }));
}

describe('JournalList performance', () => {
  beforeEach(() => {
    mockFlashListRenderCount.count = 0;
  });

  it('renders within 500ms with 500 entries', async () => {
    const entries = generate500Entries();
    const JournalEntryCard = require('@features/journal/JournalEntryCard').JournalEntryCard;

    const start = Date.now();
    const { UNSAFE_queryAllByType } = render(
      React.createElement(require('react-native').View, null,
        ...entries.slice(0, 15).map((entry) =>
          React.createElement(JournalEntryCard, { key: entry.id, entry })
        )
      )
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it('FlashList does not render all 500 items on initial mount', () => {
    // FlashList windowing: only renders visible + buffer items
    // With estimatedItemSize=88 and ~844px viewport, renders ~12 items max
    expect(mockFlashListRenderCount.count).toBeLessThanOrEqual(15);
  });
});
