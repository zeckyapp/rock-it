import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useColors } from '../../theme';
import { METAL, wavyRing } from './metal';

interface Props {
  diameter?: number;
}

// Rosette bands as on the Mac: radius and amplitude as a share of the
// radius, waves around, and how many phase-shifted copies are woven.
const BANDS = [
  { r: 0.4, a: 0.03, n: 36, copies: 6 },
  { r: 0.52, a: 0.035, n: 42, copies: 6 },
  { r: 0.66, a: 0.03, n: 48, copies: 5 },
  { r: 0.8, a: 0.025, n: 54, copies: 4 },
  { r: 0.93, a: 0.02, n: 60, copies: 3 },
];

/**
 * Banknote medallion behind the coin: fine gold guilloché rosettes, densest
 * near the coin and fading out, with a warm halo right behind the coin.
 * The lower part fades so the block number below sits on a clean background.
 * From Zecky Lock it.
 */
// Drawn once at a fixed size and scaled with the viewBox, so resizing the
// coin never recomputes the thousands of points in the rosettes.
const SIZE = 700;
let cachedRings: { d: string; opacity: number }[] | null = null;

function rosettes(): { d: string; opacity: number }[] {
  if (cachedRings != null) return cachedRings;
  const half = SIZE / 2;
  const out: { d: string; opacity: number }[] = [];
  BANDS.forEach((band, bi) => {
    const fade = 1 - bi / BANDS.length;
    for (let copy = 0; copy < band.copies; copy++) {
      const phase = ((copy / band.copies) * 2 * Math.PI) / band.n;
      out.push({
        d: wavyRing(
          half,
          half,
          band.r * half,
          band.a * half,
          band.n,
          phase,
          720,
        ),
        opacity: 0.05 + 0.1 * fade,
      });
    }
  });
  cachedRings = out;
  return out;
}

/** Works out the rosettes ahead of time, for example during the splash. */
export function prepareMedallion(): void {
  rosettes();
}

export const Medallion = memo(function MedallionDrawing({
  diameter = 560,
}: Props) {
  const colors = useColors();
  const half = SIZE / 2;
  const rings = rosettes();

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: diameter, height: diameter }}
    >
      <Svg width={diameter} height={diameter} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="32%">
            <Stop offset="0" stopColor={METAL.halo} stopOpacity={1} />
            <Stop offset="0.5" stopColor={colors.gold} stopOpacity={0.06} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="edge" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFF" stopOpacity={1} />
            <Stop offset="0.5" stopColor="#FFF" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFF" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF" stopOpacity={1} />
            <Stop offset="0.64" stopColor="#FFF" stopOpacity={1} />
            <Stop offset="0.76" stopColor="#FFF" stopOpacity={0} />
          </LinearGradient>
          <Mask id="fadeEdge">
            <Rect width={SIZE} height={SIZE} fill="url(#edge)" />
          </Mask>
          <Mask id="fadeBottom">
            <Rect width={SIZE} height={SIZE} fill="url(#bottom)" />
          </Mask>
        </Defs>
        <Circle cx={half} cy={half} r={half} fill="url(#halo)" />
        <G mask="url(#fadeBottom)">
          <G mask="url(#fadeEdge)">
            {rings.map((ring, i) => (
              <Path
                key={i}
                d={ring.d}
                fill="none"
                stroke={colors.gold}
                strokeOpacity={ring.opacity}
                strokeWidth={0.7}
              />
            ))}
            <Circle
              cx={half}
              cy={half}
              r={0.985 * half}
              fill="none"
              stroke={colors.gold}
              strokeOpacity={0.1}
              strokeWidth={0.7}
            />
            <Circle
              cx={half}
              cy={half}
              r={0.995 * half}
              fill="none"
              stroke={colors.gold}
              strokeOpacity={0.05}
              strokeWidth={0.7}
            />
          </G>
        </G>
      </Svg>
    </View>
  );
});
