import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { colors } from '@theme/tokens';

/**
 * "What changes your nights": sleep quality (x) against dream clarity (y), each
 * dream a bubble sized by how many dreams share that exact pair. A dashed trend
 * line — never a fitted regression drawn as if it were certain — restates the
 * direction in the same visual language the emotion ribbon uses for tension.
 */

export interface ScatterBubble {
  /** Sleep quality, 1–5. */
  x: number;
  /** Dream clarity, 1–5. */
  y: number;
  count: number;
}

export interface ScatterTrend {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Props {
  bubbles: ScatterBubble[];
  trend: ScatterTrend | null;
  testID?: string;
}

const WIDTH = 320;
const HEIGHT = 190;
const LEFT = 28;
const RIGHT = 12;
const TOP = 14;
const BOTTOM = 160;
const AXIS_Y = 178;
const MIN = 1;
const MAX = 5;

function projectX(value: number): number {
  return LEFT + ((value - MIN) / (MAX - MIN)) * (WIDTH - LEFT - RIGHT);
}

function projectY(value: number): number {
  return BOTTOM - ((value - MIN) / (MAX - MIN)) * (BOTTOM - TOP);
}

/** 6–16px radius across the observed count range, so one outlier dream doesn't
 * shrink every other bubble to a dot. */
function radiusFor(count: number, maxCount: number): number {
  const t = maxCount <= 1 ? 0 : (count - 1) / (maxCount - 1);
  return 6 + t * 10;
}

export function SleepClarityScatter({ bubbles, trend, testID }: Props) {
  const maxCount = bubbles.reduce((m, b) => Math.max(m, b.count), 1);
  const steps = [1, 2, 3, 4, 5];

  return (
    <View testID={testID}>
      <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" style={styles.svg}>
        <Line
          x1={LEFT}
          y1={TOP}
          x2={LEFT}
          y2={BOTTOM}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Line
          x1={LEFT}
          y1={BOTTOM}
          x2={WIDTH - RIGHT}
          y2={BOTTOM}
          stroke={colors.border}
          strokeWidth={1}
        />

        {trend ? (
          <Line
            x1={projectX(trend.x1)}
            y1={projectY(trend.y1)}
            x2={projectX(trend.x2)}
            y2={projectY(trend.y2)}
            stroke={colors.accentText}
            strokeOpacity={0.6}
            strokeWidth={2}
            strokeDasharray="4 5"
            strokeLinecap="round"
          />
        ) : null}

        {bubbles.map(b => (
          <Circle
            key={`${b.x}-${b.y}`}
            cx={projectX(b.x)}
            cy={projectY(b.y)}
            r={radiusFor(b.count, maxCount)}
            fill={colors.accent}
            fillOpacity={0.55}
            stroke={colors.accentText}
            strokeWidth={1}
          />
        ))}

        {steps.map(step => (
          <SvgText
            key={`x-${step}`}
            x={projectX(step)}
            y={AXIS_Y}
            textAnchor="middle"
            fill={colors.textMuted}
            fontSize={10}
            fontWeight="600"
          >
            {step}
          </SvgText>
        ))}
        {steps.map(step => (
          <SvgText
            key={`y-${step}`}
            x={LEFT - 10}
            y={projectY(step) + 3}
            textAnchor="end"
            fill={colors.textMuted}
            fontSize={10}
            fontWeight="600"
          >
            {step}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: {
    alignSelf: 'stretch',
    overflow: 'visible',
  },
});
