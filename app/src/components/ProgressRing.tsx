import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '../theme';

interface Props {
  /** 0 to 1. */
  progress: number;
  size?: number;
  /** Dim the ring while the Rock cannot be reached. */
  muted?: boolean;
}

/** A thin gold ring that fills as the chain comes in. */
export function ProgressRing({ progress, size = 220, muted = false }: Props) {
  const colors = useColors();
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(progress, 0), 1);
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.line}
        strokeWidth={stroke}
        fill="none"
      />
      {p > 0 && (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={muted ? colors.goldDim : colors.gold}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </Svg>
  );
}
