import React from 'react';
import { render } from '@testing-library/react-native';

import { EmotionRibbon, splinePath, type RibbonPoint } from '@features/recurrence/EmotionRibbon';

const POINTS: RibbonPoint[] = [
  { t: 0, positive: 0.35, tension: 0.3, label: '23h' },
  { t: 0.25, positive: 0.85, tension: 0.18, label: '01h' },
  { t: 0.5, positive: 0.4, tension: 0.5, label: '03h' },
  { t: 0.75, positive: 0.95, tension: 0.22, label: '05h' },
  { t: 1, positive: 0.6, tension: 0.3, label: '07h' },
];

describe('splinePath', () => {
  it('returns nothing for no points', () => {
    expect(splinePath([])).toBe('');
  });

  it('emits a bare move for a single point', () => {
    expect(splinePath([{ x: 5, y: 10 }])).toBe('M5,10');
  });

  it('starts at the first point and emits one cubic per segment', () => {
    const d = splinePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });

  it('passes exactly through every point, so the curve never misstates a value', () => {
    const pts = [
      { x: 0, y: 4 },
      { x: 10, y: 18 },
      { x: 20, y: 7 },
    ];
    const d = splinePath(pts);
    // Each segment's cubic terminates on the next data point.
    expect(d).toContain('10,18');
    expect(d).toContain('20,7');
  });

  it('rounds coordinates so the path string stays stable across renders', () => {
    const d = splinePath([
      { x: 0, y: 0 },
      { x: 1 / 3, y: 2 / 3 },
    ]);
    expect(d).not.toMatch(/\d\.\d{3,}/);
  });
});

describe('<EmotionRibbon />', () => {
  it('renders nothing below two points — a single sample is not a curve', () => {
    const { toJSON } = render(<EmotionRibbon points={[POINTS[0]!]} />);
    expect(toJSON()).toBeNull();
  });

  it('renders the legend that separates positive from tension', () => {
    const { getByText } = render(<EmotionRibbon points={POINTS} />);
    expect(getByText('positive emotions')).toBeTruthy();
    expect(getByText('tension')).toBeTruthy();
  });

  it('draws the clock axis labels', () => {
    const { toJSON } = render(<EmotionRibbon points={POINTS} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('23h');
    expect(tree).toContain('07h');
  });

  it('closes the fill down to the baseline so the ribbon reads as an area', () => {
    const { toJSON } = render(<EmotionRibbon points={POINTS} />);
    expect(JSON.stringify(toJSON())).toContain('Z');
  });

  it('sorts unordered points before drawing', () => {
    const shuffled = [POINTS[2]!, POINTS[0]!, POINTS[4]!, POINTS[1]!, POINTS[3]!];
    const ordered = render(<EmotionRibbon points={POINTS} />).toJSON();
    const fromShuffled = render(<EmotionRibbon points={shuffled} />).toJSON();
    expect(JSON.stringify(fromShuffled)).toBe(JSON.stringify(ordered));
  });

  it('clamps out-of-range values rather than drawing outside the frame', () => {
    const wild: RibbonPoint[] = [
      { t: 0, positive: -5, tension: 0 },
      { t: 1, positive: 12, tension: 3 },
    ];
    const clamped = render(<EmotionRibbon points={wild} />).toJSON();
    const wellFormed = render(
      <EmotionRibbon
        points={[
          { t: 0, positive: 0, tension: 0 },
          { t: 1, positive: 1, tension: 1 },
        ]}
      />
    ).toJSON();
    // A wildly out-of-range input produces exactly the same geometry as the
    // saturated in-range equivalent: nothing is drawn outside the frame.
    expect(JSON.stringify(clamped)).toBe(JSON.stringify(wellFormed));
  });
});
