import React from 'react';
import { render } from '@testing-library/react-native';

import {
  ConstellationChart,
  type ConstellationNode,
} from '@features/recurrence/ConstellationChart';
import { EmotionRibbon, type RibbonPoint } from '@features/recurrence/EmotionRibbon';
import { SleepClarityBars, type ClarityBar } from '@features/recurrence/SleepClarityBars';

/**
 * Every Insights chart shipped invisible: each passed `width="100%"` to <Svg> and
 * no height. react-native-svg treats that combination as a no-op — it only writes
 * the override styles and `bbHeight` when *both* dimensions are set — so the native
 * view got no height, and SVG children are not Yoga nodes that could supply an
 * intrinsic one. The geometry rendered correctly into a viewport 0px tall, which is
 * exactly why every existing test passed while nothing was on screen.
 *
 * These assertions are about the viewport, not the drawing: a chart that renders its
 * paths into nothing must fail here.
 */

interface TreeNode {
  type: string;
  props: Record<string, unknown>;
  children: TreeNode[] | null;
}

/** The <Svg> host component and the View that gives it its height. */
function findViewport(root: TreeNode): { svg: TreeNode; frame: TreeNode } {
  let found: { svg: TreeNode; frame: TreeNode } | null = null;

  const walk = (node: TreeNode, parent: TreeNode | null) => {
    if (found) return;
    if (node.type === 'RNSVGSvgView') {
      if (!parent) throw new Error('Svg rendered without a wrapping frame');
      found = { svg: node, frame: parent };
      return;
    }
    for (const child of node.children ?? []) {
      if (typeof child === 'object' && child !== null) walk(child, node);
    }
  };
  walk(root, null);

  if (!found) throw new Error('No RNSVGSvgView in the rendered tree');
  return found;
}

const NODES: ConstellationNode[] = [
  { id: 'a', term: 'flying', count: 12, dreamIds: ['d1', 'd2'], emotion: 'freedom' },
  { id: 'b', term: 'water', count: 9, dreamIds: ['d2', 'd3'], emotion: 'calm' },
  { id: 'c', term: 'house', count: 4, dreamIds: ['d4'], emotion: 'confusion' },
];

const POINTS: RibbonPoint[] = [
  { t: 0, positive: 0.3, tension: 0.5, label: '23h' },
  { t: 0.5, positive: 0.8, tension: 0.2, label: '03h' },
  { t: 1, positive: 0.6, tension: 0.4, label: '07h' },
];

const BARS: ClarityBar[] = [
  { quality: 2, meanClarity: 2, count: 3 },
  { quality: 4, meanClarity: 4.5, count: 5 },
];

const CHARTS: Array<[string, () => React.ReactElement]> = [
  ['ConstellationChart', () => <ConstellationChart nodes={NODES} />],
  ['EmotionRibbon', () => <EmotionRibbon points={POINTS} />],
  ['SleepClarityBars', () => <SleepClarityBars bars={BARS} highlightQuality={4} />],
];

describe.each(CHARTS)('%s viewport', (_name, renderChart) => {
  it('gives the Svg a height, not just a width', () => {
    const { toJSON } = render(renderChart());
    const { svg } = findViewport(toJSON() as unknown as TreeNode);

    // bbHeight is the prop react-native-svg silently omits when height is missing —
    // without it the native side maps the viewBox against a zero-height viewport.
    expect(svg.props.bbHeight).toBeDefined();
    expect(svg.props.bbWidth).toBeDefined();
  });

  it('takes its height from a frame whose aspect ratio matches the viewBox', () => {
    const { toJSON } = render(renderChart());
    const { svg, frame } = findViewport(toJSON() as unknown as TreeNode);

    // A percentage height only resolves against a parent with a definite height,
    // so the frame must derive one — and derive it from the viewBox, or the chart
    // renders letterboxed or stretched.
    const style = frame.props.style as { aspectRatio?: number } | undefined;
    const expected = (svg.props.vbWidth as number) / (svg.props.vbHeight as number);

    expect(style?.aspectRatio).toBeCloseTo(expected, 5);
  });
});

describe('EmotionRibbon axis', () => {
  it('leaves room below the axis baseline for the clock labels', () => {
    const { toJSON } = render(<EmotionRibbon points={POINTS} />);
    const { svg } = findViewport(toJSON() as unknown as TreeNode);

    // The source design puts the baseline 2px from the bottom of a 150-tall viewBox
    // and lets `overflow: visible` paint the descenders outside it — a browser
    // behaviour react-native-svg does not have, since it clips to the view bounds.
    expect(svg.props.vbHeight as number).toBeGreaterThanOrEqual(156);
  });
});
