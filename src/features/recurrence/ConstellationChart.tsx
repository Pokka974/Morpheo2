import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';

import { colors, emotionChip, radius, spacing, typography } from '@theme/tokens';

/**
 * The constellation replaces the old ranked bar chart.
 *
 * Bars rank, but they cannot show the thing that actually matters here: which themes
 * recur *together*. A force-free graph can. Radius encodes frequency, an edge means
 * two themes shared a dream, and hue carries the dominant emotion — never alone,
 * since every node also renders its label and count.
 *
 * Implemented with react-native-svg rather than a charting library: no chart library
 * draws this, and the primitives are all we need. Layout is a deterministic golden-
 * angle spiral, so the same data always produces the same sky (no animation jitter,
 * and screenshots stay stable across renders).
 */

export interface ConstellationNode {
  id: string;
  term: string;
  count: number;
  /** Emotion name used to tint the star; falls back to amethyst when unknown. */
  emotion?: string;
  /** Dreams this theme appeared in — the source of the edges. */
  dreamIds: string[];
}

interface ConstellationChartProps {
  nodes: ConstellationNode[];
  /** Minimum dreams before a constellation is meaningful (design rule: 3). */
  minNodes?: number;
  onSelect?: (node: ConstellationNode) => void;
  testID?: string;
}

const VIEWBOX_WIDTH = 340;
const VIEWBOX_HEIGHT = 268;

/** Room below the outermost star for its label, which hangs under the halo. */
const LABEL_GUTTER = 18;

/** Design rule: radius floors at 6 and caps at 14 — beyond that the count speaks. */
const MIN_RADIUS = 6;
const MAX_RADIUS = 14;

/** How far in and out a pinch may take the sky. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Golden angle — spreads points evenly without them ever aligning into rings. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function scaleRadius(count: number, maxCount: number): number {
  if (maxCount <= 0) return MIN_RADIUS;
  const ratio = Math.min(count / maxCount, 1);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(ratio);
}

/**
 * Places nodes on a phyllotaxis spiral, biggest first so the heaviest themes land
 * near the centre. Deterministic: index in, coordinates out.
 */
export function layoutNodes(
  nodes: ConstellationNode[]
): Array<ConstellationNode & { x: number; y: number; r: number }> {
  const ordered = [...nodes].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  const maxCount = ordered[0]?.count ?? 0;

  const cx = VIEWBOX_WIDTH / 2;
  const cy = VIEWBOX_HEIGHT / 2;
  // Fill the canvas rather than a circle inscribed in its short side: the old
  // `min(cx, cy)` bound clustered every star in the middle third and left the
  // corners empty, which is what made a dozen themes read as a knot. Ellipse the
  // spread per axis instead, so the sky uses the width it actually has.
  const spreadX = cx - MAX_RADIUS - LABEL_GUTTER;
  const spreadY = cy - MAX_RADIUS - LABEL_GUTTER;

  return ordered.map((node, index) => {
    const t = ordered.length === 1 ? 0 : index / (ordered.length - 1);
    const distance = Math.sqrt(t);
    const angle = index * GOLDEN_ANGLE;
    return {
      ...node,
      x: Math.round(cx + spreadX * distance * Math.cos(angle)),
      y: Math.round(cy + spreadY * distance * Math.sin(angle)),
      r: scaleRadius(node.count, maxCount),
    };
  });
}

/**
 * The window onto the sky: which part of the viewBox is on screen, and how far in.
 * Zooming is done by shrinking the SVG's own viewBox rather than scaling a
 * transform, so strokes and label text stay crisp at every level instead of
 * blurring the way a raster scale would.
 */
export interface Viewport {
  minX: number;
  minY: number;
  zoom: number;
}

export const INITIAL_VIEWPORT: Viewport = { minX: 0, minY: 0, zoom: MIN_ZOOM };

/** Keeps the window inside the canvas, so the sky can never be dragged off screen. */
export function clampViewport(view: Viewport): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const width = VIEWBOX_WIDTH / zoom;
  const height = VIEWBOX_HEIGHT / zoom;
  return {
    zoom,
    minX: Math.min(VIEWBOX_WIDTH - width, Math.max(0, view.minX)),
    minY: Math.min(VIEWBOX_HEIGHT - height, Math.max(0, view.minY)),
  };
}

/** Zooms while holding the centre of the current window still. */
export function zoomAbout(view: Viewport, nextZoom: number): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const centreX = view.minX + VIEWBOX_WIDTH / view.zoom / 2;
  const centreY = view.minY + VIEWBOX_HEIGHT / view.zoom / 2;
  return clampViewport({
    zoom,
    minX: centreX - VIEWBOX_WIDTH / zoom / 2,
    minY: centreY - VIEWBOX_HEIGHT / zoom / 2,
  });
}

/** Keeps the viewBox string stable across sub-pixel gesture noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** What the pinch/pan callbacks need from the component to move the window. */
export interface ViewportGestureDeps {
  /** The live viewport — read at gesture start, never captured at build time. */
  getView: () => Viewport;
  /** Rendered width of the frame in screen pixels, for the pan conversion. */
  getFrameWidth: () => number;
  setView: (next: Viewport) => void;
  /**
   * Panning is only enabled once zoomed in. At 1x the whole sky is already
   * visible, so claiming the drag would only steal the vertical scroll from the
   * Insights list underneath.
   */
  panEnabled: boolean;
}

/**
 * Builds the pinch + pan gestures that move the window.
 *
 * `.runOnJS(true)` is load-bearing, not a stylistic choice. The Reanimated Babel
 * plugin auto-workletises any callback chained off a `Gesture.*` object, so
 * without it these run on the UI thread — where calling a React setState or
 * mutating a JS ref throws and takes the app down on the first pinch. Every
 * callback here drives React state (the viewBox string is re-rendered, nothing is
 * animated on the UI thread), so the JS thread is where they belong; saying so
 * explicitly also silences RNGH's mixed-worklet error.
 */
export function createViewportGestures(deps: ViewportGestureDeps) {
  // Captured once per gesture so a stream of updates composes against the
  // viewport the finger started from, not the one the last frame produced.
  let start: Viewport = deps.getView();

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      start = deps.getView();
    })
    .onUpdate(e => {
      deps.setView(zoomAbout(start, start.zoom * e.scale));
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(deps.panEnabled)
    // Let a tap on a star through — the stars are what the chart is for.
    .minDistance(8)
    .onBegin(() => {
      start = deps.getView();
    })
    .onUpdate(e => {
      const unitsPerPx = VIEWBOX_WIDTH / start.zoom / Math.max(deps.getFrameWidth(), 1);
      deps.setView(
        clampViewport({
          ...start,
          minX: start.minX - e.translationX * unitsPerPx,
          minY: start.minY - e.translationY * unitsPerPx,
        })
      );
    });

  return Gesture.Simultaneous(pinch, pan);
}

/** Two themes are linked when they appeared in at least one dream together. */
export function deriveEdges(
  nodes: ConstellationNode[]
): Array<{ from: string; to: string; weight: number }> {
  const edges: Array<{ from: string; to: string; weight: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const shared = a.dreamIds.filter(id => b.dreamIds.includes(id)).length;
      if (shared > 0) edges.push({ from: a.id, to: b.id, weight: shared });
    }
  }
  return edges;
}

export function ConstellationChart({
  nodes,
  minNodes = 3,
  onSelect,
  testID,
}: ConstellationChartProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<Viewport>(INITIAL_VIEWPORT);

  // Read by the gesture callbacks, which are built once and must never close over
  // a stale render: rebuilding them on every frame of a pinch would re-attach the
  // handlers mid-gesture.
  const viewRef = useRef(view);
  viewRef.current = view;
  // Rendered width of the frame, so a pan in screen pixels can be converted into
  // the viewBox units the window actually moves by. A ref, not state — only the
  // gesture reads it, and a layout pass should not re-render the sky.
  const framePx = useRef(VIEWBOX_WIDTH);

  const placed = useMemo(() => layoutNodes(nodes), [nodes]);
  const edges = useMemo(() => deriveEdges(nodes), [nodes]);
  const byId = useMemo(() => new Map(placed.map(n => [n.id, n])), [placed]);
  const maxWeight = useMemo(() => Math.max(1, ...edges.map(e => e.weight)), [edges]);

  const isZoomed = view.zoom > MIN_ZOOM;

  // Rebuilt only when panning is switched on or off, never on every frame of a
  // gesture: the callbacks reach the current viewport through the ref instead.
  const gesture = useMemo(
    () =>
      createViewportGestures({
        getView: () => viewRef.current,
        getFrameWidth: () => framePx.current,
        setView,
        panEnabled: isZoomed,
      }),
    [isZoomed]
  );
  const windowWidth = VIEWBOX_WIDTH / view.zoom;
  const windowHeight = VIEWBOX_HEIGHT / view.zoom;

  // Design rule: below the threshold there is no graph, only the empty state.
  if (nodes.length < minNodes) {
    return (
      <View style={styles.empty} testID={testID}>
        <Text style={styles.emptyTitle}>{t('insights.constellationEmptyTitle')}</Text>
        <Text style={styles.emptyBody}>
          {t('insights.constellationEmptyBody', { min: minNodes })}
        </Text>
      </View>
    );
  }

  const selected = selectedId ? byId.get(selectedId) : undefined;

  return (
    <View testID={testID}>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.svgFrame}
          onLayout={e => {
            framePx.current = e.nativeEvent.layout.width;
          }}
          collapsable={false}
        >
          <Svg
            viewBox={`${round2(view.minX)} ${round2(view.minY)} ${round2(windowWidth)} ${round2(windowHeight)}`}
            width="100%"
            height="100%"
          >
            {/* Co-occurrence threads sit behind the stars. */}
            <G>
              {edges.map(edge => {
                const a = byId.get(edge.from);
                const b = byId.get(edge.to);
                if (!a || !b) return null;
                return (
                  <Line
                    key={`${edge.from}-${edge.to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={colors.accentText}
                    strokeOpacity={0.12 + 0.2 * (edge.weight / maxWeight)}
                    strokeWidth={1}
                  />
                );
              })}
            </G>

            <G>
              {placed.map(node => {
                const hue = emotionChip(node.emotion ?? '').text;
                return (
                  <G key={node.id}>
                    {/* Halo — the star's glow, twice its radius. */}
                    <Circle cx={node.x} cy={node.y} r={node.r * 2} fill={hue} opacity={0.11} />
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={hue}
                      onPress={() => {
                        setSelectedId(node.id);
                        onSelect?.(node);
                      }}
                      accessible
                      accessibilityLabel={t('insights.starSelected', {
                        term: node.term,
                        count: node.count,
                      })}
                    />
                  </G>
                );
              })}
            </G>

            {/* A single white ring is the only selection indicator. */}
            {selected ? (
              <Circle
                cx={selected.x}
                cy={selected.y}
                r={selected.r + 7}
                fill="none"
                stroke={colors.textPrimary}
                strokeWidth={1.2}
                strokeOpacity={0.8}
              />
            ) : null}

            {/* No datum is carried by colour alone: every star states its name and count. */}
            <G>
              {placed.map(node => (
                <SvgText
                  key={`label-${node.id}`}
                  x={node.x}
                  y={node.y + node.r * 2 + 12}
                  textAnchor="middle"
                  fill={colors.textSecondary}
                  fontSize={11}
                  fontWeight="600"
                >
                  {t('insights.themeOccurrences', { term: node.term, count: node.count })}
                </SvgText>
              ))}
            </G>
          </Svg>
        </View>
      </GestureDetector>

      {isZoomed ? (
        <Pressable
          onPress={() => setView(INITIAL_VIEWPORT)}
          accessibilityRole="button"
          style={styles.resetZoom}
        >
          <Text style={styles.resetZoomLabel}>{t('insights.constellationResetZoom')}</Text>
        </Pressable>
      ) : null}

      <View style={styles.readout}>
        <Text style={styles.readoutTitle}>
          {selected
            ? t('insights.starSelected', { term: selected.term, count: selected.count })
            : t('insights.starHint')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The Svg needs a viewport with a definite height. A percentage height only
   * resolves against a parent whose own height is definite, so the frame derives
   * one from the viewBox ratio and the Svg fills it — passing width without
   * height, or leaning on the Svg's own aspectRatio, collapses it to zero.
   */
  svgFrame: {
    width: '100%',
    aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
  },
  resetZoom: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderElevated,
  },
  resetZoomLabel: {
    ...typography.chip,
    color: colors.accentText,
  },
  readout: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readoutTitle: {
    ...typography.dreamBody,
    fontSize: 15,
    color: colors.textPrimary,
  },
  empty: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.panel,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.cardTitle,
  },
  emptyBody: {
    ...typography.meta,
    textAlign: 'center',
  },
});
