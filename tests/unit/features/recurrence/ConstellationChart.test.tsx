import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import {
  ConstellationChart,
  deriveEdges,
  layoutNodes,
  scaleRadius,
  type ConstellationNode,
} from '@features/recurrence/ConstellationChart';

function node(
  id: string,
  term: string,
  count: number,
  dreamIds: string[],
  emotion?: string
): ConstellationNode {
  return { id, term, count, dreamIds, ...(emotion ? { emotion } : {}) };
}

const THREE: ConstellationNode[] = [
  node('a', 'flying', 12, ['d1', 'd2', 'd3'], 'freedom'),
  node('b', 'water', 9, ['d2', 'd4'], 'calm'),
  node('c', 'house', 4, ['d5'], 'confusion'),
];

describe('scaleRadius', () => {
  it('floors at 6 and caps at 14, per the design rule', () => {
    expect(scaleRadius(0, 10)).toBe(6);
    expect(scaleRadius(10, 10)).toBe(14);
    // Beyond the max the theme is capped, not grown further.
    expect(scaleRadius(50, 10)).toBe(14);
  });

  it('grows monotonically between the bounds', () => {
    const small = scaleRadius(2, 10);
    const mid = scaleRadius(5, 10);
    const large = scaleRadius(9, 10);
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(large);
  });

  it('survives a zero maximum without dividing by zero', () => {
    expect(scaleRadius(0, 0)).toBe(6);
    expect(Number.isFinite(scaleRadius(3, 0))).toBe(true);
  });
});

describe('layoutNodes', () => {
  it('is deterministic — the same data always produces the same sky', () => {
    expect(layoutNodes(THREE)).toEqual(layoutNodes(THREE));
  });

  it('orders by count so the heaviest theme sits nearest the centre', () => {
    const placed = layoutNodes(THREE);
    expect(placed.map(n => n.term)).toEqual(['flying', 'water', 'house']);
  });

  it('breaks count ties alphabetically, so ordering never flickers', () => {
    const tied = [node('x', 'zebra', 5, []), node('y', 'apple', 5, [])];
    expect(layoutNodes(tied).map(n => n.term)).toEqual(['apple', 'zebra']);
  });

  it('keeps every star inside the viewBox', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      node(`n${i}`, `t${i}`, 12 - i, [`d${i}`])
    );
    for (const placed of layoutNodes(many)) {
      expect(placed.x).toBeGreaterThanOrEqual(0);
      expect(placed.x).toBeLessThanOrEqual(340);
      expect(placed.y).toBeGreaterThanOrEqual(0);
      expect(placed.y).toBeLessThanOrEqual(268);
    }
  });

  it('centres a lone node', () => {
    const [only] = layoutNodes([node('a', 'solo', 3, ['d1'])]);
    expect(only?.x).toBe(170);
    expect(only?.y).toBe(134);
  });

  it('handles an empty set', () => {
    expect(layoutNodes([])).toEqual([]);
  });
});

describe('deriveEdges', () => {
  it('links two themes that shared a dream', () => {
    const edges = deriveEdges(THREE);
    expect(edges).toContainEqual({ from: 'a', to: 'b', weight: 1 });
  });

  it('does not link themes that never co-occurred', () => {
    const edges = deriveEdges(THREE);
    expect(edges.find(e => e.to === 'c' || e.from === 'c')).toBeUndefined();
  });

  it('weights an edge by the number of shared dreams', () => {
    const pair = [
      node('a', 'one', 3, ['d1', 'd2', 'd3']),
      node('b', 'two', 3, ['d1', 'd2']),
    ];
    expect(deriveEdges(pair)).toEqual([{ from: 'a', to: 'b', weight: 2 }]);
  });

  it('produces one edge per pair, never duplicates or self-links', () => {
    const edges = deriveEdges(THREE);
    const keys = edges.map(e => [e.from, e.to].sort().join('-'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(edges.every(e => e.from !== e.to)).toBe(true);
  });
});

describe('<ConstellationChart />', () => {
  it('renders the empty state below the minimum, rather than a sparse graph', () => {
    const { getByText } = render(<ConstellationChart nodes={[THREE[0]!]} />);
    expect(getByText('Not enough dreams yet')).toBeTruthy();
  });

  it('honours a custom minimum', () => {
    const { getByText } = render(<ConstellationChart nodes={THREE} minNodes={5} />);
    expect(getByText(/Log at least 5 dreams/)).toBeTruthy();
  });

  it('labels every star with its term and count, so colour is never the only signal', () => {
    // Labels render inside react-native-svg <Text>, which getByText does not
    // traverse, so assert against the serialised tree.
    const { toJSON } = render(<ConstellationChart nodes={THREE} />);
    const tree = JSON.stringify(toJSON());
    expect(tree).toContain('flying · 12');
    expect(tree).toContain('water · 9');
    expect(tree).toContain('house · 4');
  });

  it('prompts the reader before anything is selected', () => {
    const { getByText } = render(<ConstellationChart nodes={THREE} />);
    expect(getByText('Tap a star to read its theme.')).toBeTruthy();
  });

  it('reports the selected theme and notifies the caller', () => {
    const onSelect = jest.fn();
    const { getByLabelText, getByText } = render(
      <ConstellationChart nodes={THREE} onSelect={onSelect} />
    );

    fireEvent.press(getByLabelText('flying — 12 dreams'));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ term: 'flying' }));
    expect(getByText('flying — 12 dreams')).toBeTruthy();
  });

  it('keeps only one selection at a time', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <ConstellationChart nodes={THREE} />
    );

    fireEvent.press(getByLabelText('flying — 12 dreams'));
    fireEvent.press(getByLabelText('water — 9 dreams'));

    expect(getByText('water — 9 dreams')).toBeTruthy();
    // The previous readout is gone — the white ring is the single selection marker.
    expect(queryByText('flying — 12 dreams')).toBeNull();
  });

  it('renders an unknown emotion without crashing', () => {
    const odd = [...THREE, node('d', 'staircase', 3, ['d9'], 'a-feeling-with-no-token')];
    const { toJSON } = render(<ConstellationChart nodes={odd} />);
    expect(JSON.stringify(toJSON())).toContain('staircase · 3');
  });
});
