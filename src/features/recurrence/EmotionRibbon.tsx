import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { colors, emotionColors, ribbonFillStops, ribbonStops, typography } from '@theme/tokens';

/**
 * The emotion ribbon: a night's emotional arc from bedtime to waking.
 *
 * The gradient is the point. It restates the passage literally — indigo at
 * bedtime, violet at depth, amber at the moment of waking — so the chart carries
 * the same metaphor as the rest of the app instead of reading as a generic line
 * graph. Tension stays a dashed, low-opacity line so it never visually dominates
 * the positive curve.
 *
 * Drawn as a Catmull-Rom spline converted to cubic Béziers: the organic, breathing
 * curve in the design is not something a straight polyline or a step chart gives you.
 */

export interface RibbonPoint {
  /** 0 = bedtime, 1 = waking. */
  t: number;
  /** 0 = flat, 1 = peak. */
  positive: number;
  /** 0 = none, 1 = peak. */
  tension: number;
  /** Clock label rendered on the axis, e.g. "23h". */
  label?: string;
}

interface EmotionRibbonProps {
  points: RibbonPoint[];
  testID?: string;
}

const WIDTH = 320;
/**
 * 6px taller than the source design's 320×150. The design draws the clock labels
 * on a baseline 2px from the bottom edge and relies on `overflow: visible` to let
 * the descenders paint outside the viewport — a browser behaviour that
 * react-native-svg does not have, since it clips to the view bounds. The extra
 * room lands under the axis; the ribbon geometry (TOP/BOTTOM) is unchanged.
 */
const HEIGHT = 156;
const PADDING_X = 6;
const TOP = 30;
const BOTTOM = 132;
const AXIS_Y = 148;

function project(point: RibbonPoint): { x: number; y: number } {
  return {
    x: PADDING_X + point.t * (WIDTH - PADDING_X * 2),
    y: BOTTOM - Math.max(0, Math.min(1, point.positive)) * (BOTTOM - TOP),
  };
}

function projectTension(point: RibbonPoint): { x: number; y: number } {
  return {
    x: PADDING_X + point.t * (WIDTH - PADDING_X * 2),
    // Tension rides lower in the frame so the two curves stay legible apart.
    y: BOTTOM - Math.max(0, Math.min(1, point.tension)) * (BOTTOM - TOP) * 0.55,
  };
}

/**
 * Catmull-Rom through every point, emitted as cubic Béziers. Unlike a naive
 * quadratic smoothing this passes exactly through the data — the curve is organic
 * without being dishonest about the values.
 */
export function splinePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`;

  let d = `M${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(p2.x)},${round(p2.y)}`;
  }
  return d;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function EmotionRibbon({ points, testID }: EmotionRibbonProps) {
  const { t } = useTranslation();

  const sorted = useMemo(() => [...points].sort((a, b) => a.t - b.t), [points]);

  const { strokePath, fillPath, tensionPath, peaks } = useMemo(() => {
    const positive = sorted.map(project);
    const tension = sorted.map(projectTension);
    const stroke = splinePath(positive);

    const first = positive[0];
    const last = positive[positive.length - 1];
    const fill = first && last ? `${stroke} L${last.x},${BOTTOM} L${first.x},${BOTTOM} Z` : '';

    // Mark the highest point and the waking point — the two moments worth a dot.
    const highest = positive.reduce(
      (best, p, i) => (p.y < (positive[best]?.y ?? Infinity) ? i : best),
      0
    );

    const marks: Array<{ x: number; y: number; color: string }> = [];
    const peak = positive[highest];
    if (peak) marks.push({ x: peak.x, y: peak.y, color: colors.accentText });
    if (last) marks.push({ x: last.x, y: last.y, color: colors.highlight });

    return {
      strokePath: stroke,
      fillPath: fill,
      tensionPath: splinePath(tension),
      peaks: marks,
    };
  }, [sorted]);

  if (sorted.length < 2) return null;

  return (
    <View testID={testID}>
      <View style={styles.svgFrame}>
        <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%">
          <Defs>
            <LinearGradient id="ribbonStroke" x1="0" y1="0" x2="1" y2="0">
              {ribbonStops.map(stop => (
                <Stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={stop.opacity}
                />
              ))}
            </LinearGradient>
            <LinearGradient id="ribbonFill" x1="0" y1="0" x2="1" y2="0">
              {ribbonFillStops.map(stop => (
                <Stop
                  key={stop.offset}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={stop.opacity}
                />
              ))}
            </LinearGradient>
          </Defs>

          <Path d={fillPath} fill="url(#ribbonFill)" />
          <Path
            d={strokePath}
            fill="none"
            stroke="url(#ribbonStroke)"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <Path
            d={tensionPath}
            fill="none"
            stroke={emotionColors.fear}
            strokeOpacity={0.5}
            strokeWidth={2}
            strokeDasharray="3 4"
          />

          {peaks.map((peak, i) => (
            <Circle key={i} cx={peak.x} cy={peak.y} r={4} fill={peak.color} />
          ))}

          <G>
            {sorted.map((point, i) =>
              point.label ? (
                <SvgText
                  key={point.label}
                  x={project(point).x}
                  y={AXIS_Y}
                  textAnchor={i === 0 ? 'start' : i === sorted.length - 1 ? 'end' : 'middle'}
                  fill={colors.textMuted}
                  fontSize={10}
                  fontWeight="600"
                >
                  {point.label}
                </SvgText>
              ) : null
            )}
          </G>
        </Svg>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.legendSwatchPositive} />
          <Text style={styles.legendLabel}>{t('insights.ribbonLegendPositive')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendSwatchTension} />
          <Text style={styles.legendLabel}>{t('insights.ribbonLegendTension')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** See ConstellationChart — the Svg needs a parent with a definite height. */
  svgFrame: {
    width: '100%',
    aspectRatio: WIDTH / HEIGHT,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  legendSwatchPositive: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  legendSwatchTension: {
    width: 16,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: emotionColors.fear,
  },
  legendLabel: {
    ...typography.chip,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
});
