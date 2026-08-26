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

export function LockIcon({ size = 28, color = colors.highlight, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M5.5 10.5h13a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M12 15v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function MicIcon({ size = 20, color = colors.accentText, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V6A3.5 3.5 0 0 0 12 2.5Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M6 11v.5a6 6 0 0 0 12 0V11M12 17.5v3.5M9 21h6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function StopIcon({ size = 20, color = colors.error, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.5 5.5h13v13h-13z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
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

/**
 * The back affordance on a modal flow. The design draws it as a "‹" glyph; the
 * system's own rule — icons are drawn, never typed — makes it a stroke instead.
 */
export function ChevronLeftIcon({
  size = 16,
  color = colors.textSecondary,
  strokeWidth = 1.8,
}: IconProps) {
  return (
    <Svg width={size} height={size * 1.14} viewBox="0 0 14 16" fill="none">
      <Path
        d="M9 1l-7 7 7 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Dismiss — the "×" of the wait screen, drawn as two strokes. */
export function CloseIcon({
  size = 16,
  color = colors.textSecondary,
  strokeWidth = 1.8,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 5l14 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M19 5L5 19" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A generic four-point sparkle — marks a cultural/mythological reference row on the
 * dream detail screen. Deliberately the same glyph for every row rather than a
 * different icon per tradition: the AI's freeform `tradition` string doesn't support a
 * principled icon taxonomy, so one consistent "notable symbol" mark is drawn instead.
 */
export function SymbolIcon({ size = 12, color = colors.accentText, strokeWidth = 1.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Writing mode in the dream-log segmented control. */
export function PenIcon({ size = 16, color = colors.textMuted, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
