import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { colors } from '@theme/tokens';

/**
 * "What changes your nights": mean dream clarity for each sleep-quality rating.
 *
 * This replaces a scatter plot. The statistic underneath was sound — a
 * least-squares slope that refused to claim a threshold when it was flat — but it
 * plotted onto a 5×5 integer lattice, so at any realistic journal size the reader
 * saw a handful of dots and no pattern, on two axes of bare 1–5 numbers with
 * nothing saying which was which. Five bars answer the same question at a glance
 * and stay legible from the very first week: each bar is one sleep rating, its
 * height the average clarity of the dreams that followed, its count printed above
 * so a bar resting on a single night can never read as a trend.
 */

export interface ClarityBar {
  /** Sleep quality, 1–5. */
  quality: number;
  /** Mean dream clarity for that rating, 1–5. */
  meanClarity: number;
  /** How many dreams the mean is drawn from. */
  count: number;
}

interface Props {
  bars: ClarityBar[];
  /** Rating at which clarity plateaus, highlighted amber. `null` when unproven. */
  highlightQuality: number | null;
  testID?: string;
}

const WIDTH = 320;
const HEIGHT = 190;
const LEFT = 26;
const RIGHT = 10;
const TOP = 18;
/** Baseline of the bars — the axis they stand on. */
const BASE = 142;
/** Baseline of the sleep-quality numbers under each bar. */
const TICK_Y = 158;
/** Baseline of the axis titles, below the ticks. */
const TITLE_Y = 180;

const MIN = 1;
const MAX = 5;
const QUALITIES = [1, 2, 3, 4, 5];

const SLOT = (WIDTH - LEFT - RIGHT) / QUALITIES.length;
/** Leaves a gutter either side of each bar so five bars never read as one block. */
const BAR_WIDTH = SLOT * 0.56;

function slotCentre(quality: number): number {
  return LEFT + (quality - MIN + 0.5) * SLOT;
}

/** Clarity 1 sits on the baseline, clarity 5 at the top of the plot. */
function barTop(meanClarity: number): number {
  const ratio = Math.max(0, Math.min(1, (meanClarity - MIN) / (MAX - MIN)));
  return BASE - ratio * (BASE - TOP);
}

export function SleepClarityBars({ bars, highlightQuality, testID }: Props) {
  const { t } = useTranslation();
  const byQuality = new Map(bars.map(b => [b.quality, b]));

  return (
    <View testID={testID}>
      <View style={styles.svgFrame}>
        <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%">
          {/* Gridlines at each clarity step, so a bar's height is readable as a value. */}
          {QUALITIES.map(step => {
            const y = barTop(step);
            return (
              <React.Fragment key={`grid-${step}`}>
                <Line
                  x1={LEFT}
                  y1={y}
                  x2={WIDTH - RIGHT}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={LEFT - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill={colors.textMuted}
                  fontSize={9}
                  fontWeight="600"
                >
                  {step}
                </SvgText>
              </React.Fragment>
            );
          })}

          {QUALITIES.map(quality => {
            const bar = byQuality.get(quality);
            const centre = slotCentre(quality);

            return (
              <React.Fragment key={`bar-${quality}`}>
                {bar ? (
                  <>
                    <Rect
                      x={centre - BAR_WIDTH / 2}
                      y={barTop(bar.meanClarity)}
                      width={BAR_WIDTH}
                      height={Math.max(1, BASE - barTop(bar.meanClarity))}
                      rx={4}
                      fill={
                        highlightQuality != null && quality >= highlightQuality
                          ? colors.highlight
                          : colors.accent
                      }
                      fillOpacity={0.85}
                    />
                    {/* The sample size rides above the bar: no bar may imply more
                        confidence than the nights behind it. */}
                    <SvgText
                      x={centre}
                      y={barTop(bar.meanClarity) - 5}
                      textAnchor="middle"
                      fill={colors.textMuted}
                      fontSize={9}
                      fontWeight="600"
                    >
                      {t('insights.nightCount', { count: bar.count })}
                    </SvgText>
                  </>
                ) : null}

                <SvgText
                  x={centre}
                  y={TICK_Y}
                  textAnchor="middle"
                  fill={bar ? colors.textSecondary : colors.textMuted}
                  fontSize={11}
                  fontWeight="600"
                >
                  {quality}
                </SvgText>
              </React.Fragment>
            );
          })}

          <Line
            x1={LEFT}
            y1={BASE}
            x2={WIDTH - RIGHT}
            y2={BASE}
            stroke={colors.borderElevated}
            strokeWidth={1}
          />

          {/* Both axes are named. The scatter left the reader decoding two
              identical 1–5 scales. */}
          <SvgText
            x={LEFT + (WIDTH - LEFT - RIGHT) / 2}
            y={TITLE_Y}
            textAnchor="middle"
            fill={colors.textMuted}
            fontSize={10}
            fontWeight="600"
          >
            {t('insights.axisSleepQuality')}
          </SvgText>
          <SvgText
            x={0}
            y={0}
            transform={`translate(9, ${(BASE + TOP) / 2}) rotate(-90)`}
            textAnchor="middle"
            fill={colors.textMuted}
            fontSize={10}
            fontWeight="600"
          >
            {t('insights.axisDreamClarity')}
          </SvgText>
        </Svg>
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
});
