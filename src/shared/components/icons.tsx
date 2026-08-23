import React from 'react';
import Svg, { Path, Polyline } from 'react-native-svg';

import { colors } from '@theme/tokens';

/**
 * Drawn, stroke-based icons on the 24px grid the design system uses for the tab bar.
 * The system's rule against emoji and dingbats applies everywhere, not only in
 * navigation chrome — these replace the ⚠️ / 🗑 / ✓ glyphs settings screens had been
 * using as one-off text characters.
 */

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function ChevronRightIcon({
  size = 16,
  color = colors.textMuted,
  strokeWidth = 1.8,
}: IconProps) {
  return (
    <Svg width={size} height={size * 1.14} viewBox="0 0 14 16" fill="none">
      <Path
        d="M2 1l7 7-7 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function WarningIcon({ size = 22, color = colors.error, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5 L22 20.5 H2 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M12 9.5v5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M12 17.5h.01" stroke={color} strokeWidth={strokeWidth + 0.4} strokeLinecap="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 28, color = colors.textPrimary, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path
        d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.5 7l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon({ size = 28, color = colors.success, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="4,13 9.5,18.5 20,6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
