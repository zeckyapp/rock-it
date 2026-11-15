import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { useColors } from '../../theme';

interface Props {
  /** 0 to 1, how far the node has synced. */
  progress: number;
  diameter?: number;
}

// Room around the ring for the glow of the tip.
const PAD = 10;

/**
 * A thin gold ring around the coin that fills as the node syncs, with a
 * glowing tip like the hand of a clock and fine tick marks (from Lock it).
 */
export function SyncRing({ progress, diameter = 300 }: Props) {
  const colors = useColors();
  const p = Math.max(0.004, Math.min(1, progress));
  const r = diameter / 2;
  const c = r + PAD;
  const size = diameter + PAD * 2;
  const circumference = 2 * Math.PI * r;
  const angle = (p * 360 - 90) * (Math.PI / 180);
  const tip = { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };

  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const long = i % 5 === 0;
    const h = long ? 8 : 4;
    const a = (i * 6 - 90) * (Math.PI / 180);
    const r1 = r - 10 - h / 2;
    const r2 = r - 10 + h / 2;
    ticks.push(
      <Line
        key={i}
        x1={c + r1 * Math.cos(a)}
        y1={c + r1 * Math.sin(a)}
        x2={c + r2 * Math.cos(a)}
        y2={c + r2 * Math.sin(a)}
        stroke={colors.gold}
        strokeOpacity={long ? 0.35 : 0.14}
        strokeWidth={1}
      />,
    );
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={colors.gold}
          strokeOpacity={0.14}
          strokeWidth={2}
        />
        <G rotation={-90} origin={`${c}, ${c}`}>
          {/* A soft wide copy under the arc stands in for its glow. */}
          <Circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={colors.gold}
            strokeOpacity={0.18}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={[circumference * p, circumference]}
          />
          <Circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={colors.gold}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={[circumference * p, circumference]}
          />
        </G>
        <Circle
          cx={tip.x}
          cy={tip.y}
          r={9}
          fill={colors.gold}
          fillOpacity={0.18}
        />
        <Circle cx={tip.x} cy={tip.y} r={4} fill={colors.gold} />
        {ticks}
      </Svg>
    </View>
  );
}
