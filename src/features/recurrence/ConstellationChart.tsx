import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
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

/** Design rule: radius floors at 6 and caps at 14 — beyond that the count speaks. */
const MIN_RADIUS = 6;
const MAX_RADIUS = 14;

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
  // Keep the outermost star and its label inside the viewBox.
  const spread = Math.min(cx, cy) - MAX_RADIUS - 22;

  return ordered.map((node, index) => {
    const t = ordered.length === 1 ? 0 : index / (ordered.length - 1);
    const distance = spread * Math.sqrt(t);
    const angle = index * GOLDEN_ANGLE;
    return {
      ...node,
      x: Math.round(cx + distance * Math.cos(angle)),
      y: Math.round(cy + distance * Math.sin(angle)),
      r: scaleRadius(node.count, maxCount),
    };
  });
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

  const placed = useMemo(() => layoutNodes(nodes), [nodes]);
  const edges = useMemo(() => deriveEdges(nodes), [nodes]);
  const byId = useMemo(() => new Map(placed.map(n => [n.id, n])), [placed]);
  const maxWeight = useMemo(() => Math.max(1, ...edges.map(e => e.weight)), [edges]);

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
      <Svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} width="100%" style={styles.svg}>
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
  svg: {
    alignSelf: 'stretch',
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
