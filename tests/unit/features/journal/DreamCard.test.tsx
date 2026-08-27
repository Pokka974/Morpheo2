import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { DreamCard, type JournalEntry } from '@features/journal/DreamCard';

const BASE: JournalEntry = {
  id: 'dream-1',
  description: 'I was flying over an unfamiliar city. The rooftops went on forever.',
  occurredAt: '2026-08-25T06:40:00.000Z',
  syncStatus: 'synced',
  thumbnailUri: null,
};

function renderCard(entry: Partial<JournalEntry> = {}, variant: 'full' | 'compact' = 'full') {
  const onPress = jest.fn();
  const utils = render(
    <DreamCard entry={{ ...BASE, ...entry }} variant={variant} onPress={onPress} />
  );
  return { ...utils, onPress };
}

describe('<DreamCard /> full', () => {
  it('leads with the first sentence as a title', () => {
    const { getByText } = renderCard();
    expect(getByText('I was flying over an unfamiliar city.')).toBeTruthy();
  });

  it('prefers a real title when the interpretation supplied one', () => {
    const { getByText } = renderCard({ title: 'The flight over the city' });
    expect(getByText('The flight over the city')).toBeTruthy();
  });

  it('does not repeat a one-sentence dream as both title and excerpt', () => {
    const { getAllByText } = renderCard({ description: 'A single short dream.' });
    expect(getAllByText('A single short dream.')).toHaveLength(1);
  });

  it('renders at most three emotion chips', () => {
    const { getByText, queryByText } = renderCard({
      emotions: ['freedom', 'calm', 'wonder', 'nostalgia'],
    });
    expect(getByText('freedom')).toBeTruthy();
    expect(getByText('wonder')).toBeTruthy();
    expect(queryByText('nostalgia')).toBeNull();
  });

  it('shows the lucid marker only when the dream was lucid', () => {
    expect(renderCard({ isLucid: true }).getByText('lucid')).toBeTruthy();
    expect(renderCard().queryByText('lucid')).toBeNull();
  });

  it('renders a tone dot labelled with the tone when one is set', () => {
    const { getByLabelText } = renderCard({ tone: 'positive' });
    expect(getByLabelText('Tone: Positive')).toBeTruthy();
    expect(renderCard().queryByLabelText(/^Tone:/)).toBeNull();
  });

  it('renders five clarity dots labelled with the value when clarity is set', () => {
    const { getByLabelText } = renderCard({ clarity: 4 });
    expect(getByLabelText('Clarity: 4 of 5')).toBeTruthy();
    expect(renderCard().queryByLabelText(/^Clarity:/)).toBeNull();
  });

  it('falls back to a placeholder when no visual has been generated', () => {
    const { getByText } = renderCard();
    expect(getByText('Generated visual')).toBeTruthy();
  });

  it('opens the dream when pressed', () => {
    const { getByLabelText, onPress } = renderCard();
    fireEvent.press(getByLabelText(/Open dream/));
    expect(onPress).toHaveBeenCalledWith('dream-1');
  });

  it('truncates a long description in both the title and the excerpt', () => {
    const long = `${'word '.repeat(80)}end`;
    const { getAllByText } = renderCard({ description: long });
    const clipped = getAllByText(/…$/);
    // A sentence-less wall of text clips twice: once as the title, once as the excerpt.
    expect(clipped).toHaveLength(2);
    clipped.forEach(node => expect(String(node.props.children).length).toBeLessThan(150));
  });
});

describe('<DreamCard /> compact', () => {
  it('shows the syncing state for a queued dream', () => {
    const { getByText } = renderCard({ syncStatus: 'sync_pending' }, 'compact');
    expect(getByText('Syncing…')).toBeTruthy();
  });

  it('treats a local-only dream as pending too', () => {
    const { getByText } = renderCard({ syncStatus: 'local' }, 'compact');
    expect(getByText('Syncing…')).toBeTruthy();
  });

  it('flags a dream whose interpretation has landed', () => {
    const { getByText } = renderCard({ hasInterpretation: true }, 'compact');
    expect(getByText('Interpretation ready')).toBeTruthy();
  });

  it('shows the date for a plain synced dream', () => {
    const { queryByText } = renderCard({}, 'compact');
    expect(queryByText('Syncing…')).toBeNull();
    expect(queryByText('Interpretation ready')).toBeNull();
  });

  it('shows a single leading emotion chip', () => {
    const { getByText, queryByText } = renderCard({ emotions: ['calm', 'wonder'] }, 'compact');
    expect(getByText('calm')).toBeTruthy();
    expect(queryByText('wonder')).toBeNull();
  });

  it('opens the dream when pressed', () => {
    const { getByLabelText, onPress } = renderCard({}, 'compact');
    fireEvent.press(getByLabelText(/Open dream/));
    expect(onPress).toHaveBeenCalledWith('dream-1');
  });

  it('badges a nightmare but not an ordinary type tag', () => {
    expect(renderCard({ dreamType: ['nightmare'] }, 'compact').getByText('Nightmare')).toBeTruthy();
    expect(renderCard({ dreamType: ['flying'] }, 'compact').queryByText('Nightmare')).toBeNull();
  });

  it('shows clarity dots on the compact row when clarity is set', () => {
    const { getByLabelText } = renderCard({ clarity: 2 }, 'compact');
    expect(getByLabelText('Clarity: 2 of 5')).toBeTruthy();
  });

  it('hides the tone dot and type badge while a dream is still syncing', () => {
    const { queryByLabelText, queryByText } = renderCard(
      { syncStatus: 'sync_pending', tone: 'negative', dreamType: ['nightmare'] },
      'compact'
    );
    expect(queryByLabelText(/^Tone:/)).toBeNull();
    expect(queryByText('Nightmare')).toBeNull();
  });
});
