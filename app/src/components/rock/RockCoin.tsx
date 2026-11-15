import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { fonts } from '../../theme';
import { METAL } from './metal';

interface Props {
  /** What the name plate says: SYNCED, SYNCING, OFFLINE… No plate when null. */
  plate: string | null;
  /** Dull grey metal, for when the Rock can't be reached. */
  dull?: boolean;
  /** Width in points; the coin is drawn on a 300 × 300 canvas. */
  size?: number;
}

const S = 300;
const C = S / 2;
const R = 132; // outer rim
const BODY = 120;
const RING = 88; // the engraved ring with its three peers, as in the app icon

// The same brass as the Zecky lock, and a pewter version for "out of reach".
const GOLD = {
  rim: ['#F7E6B8', '#C99E4F', '#705421'],
  body: [METAL.bodyTop, METAL.gold, METAL.bodyBottom],
  engrave: METAL.engraveInk,
  light: METAL.engraveLight,
  halo: 0.26,
};
const DULL = {
  rim: ['#C9CBD1', '#8C8F98', '#4A4D55'],
  body: ['#D3D5DA', '#9A9DA5', '#55585F'],
  engrave: '#3E4047',
  light: 'rgba(240, 242, 246, 0.35)',
  halo: 0,
};

/**
 * The Rock it coin: the app icon (the Z in a ring with three peers) struck
 * in the brass of the Zecky lock, with a dark name plate like Lock it's
 * LOCKED. It stands for your node on the main screen.
 */
export function RockCoin({ plate, dull = false, size = 230 }: Props) {
  const m = dull ? DULL : GOLD;
  const scale = size / S;
  const zBaseline = plate ? C + 26 : C + 42;
  const peers = [-90, 30, 150].map(a => ({
    x: C + RING * Math.cos((a * Math.PI) / 180),
    y: C + RING * Math.sin((a * Math.PI) / 180),
  }));

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View
        style={[
          styles.canvas,
          {
            left: (size - S) / 2,
            top: (size - S) / 2,
            transform: [{ scale }],
          },
        ]}
      >
        <Svg width={S} height={S + 24}>
          <Defs>
            <RadialGradient id="coinHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#F5D68F" stopOpacity={m.halo} />
              <Stop offset="1" stopColor="#F5D68F" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="coinShadow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#000" stopOpacity={0.6} />
              <Stop offset="1" stopColor="#000" stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="coinRim" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={m.rim[0]} />
              <Stop offset="0.45" stopColor={m.rim[1]} />
              <Stop offset="1" stopColor={m.rim[2]} />
            </LinearGradient>
            <LinearGradient id="coinBody" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={m.body[0]} />
              <Stop offset="0.5" stopColor={m.body[1]} />
              <Stop offset="1" stopColor={m.body[2]} />
            </LinearGradient>
            <LinearGradient id="coinSheen" x1="0" y1="0" x2="1" y2="0.3">
              <Stop offset="0" stopColor="#FFF" stopOpacity={0} />
              <Stop offset="0.3" stopColor="#FFF" stopOpacity={0.3} />
              <Stop offset="0.48" stopColor="#FFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Circle cx={C} cy={C} r={R * 1.12} fill="url(#coinHalo)" />
          <Ellipse
            cx={C}
            cy={C + R + 10}
            rx={R * 0.85}
            ry={12}
            fill="url(#coinShadow)"
          />
          <Circle cx={C} cy={C} r={R} fill="url(#coinRim)" />
          <Circle
            cx={C}
            cy={C}
            r={R - 0.75}
            fill="none"
            stroke={METAL.outerEdge}
            strokeWidth={1.5}
          />
          <Circle cx={C} cy={C} r={BODY} fill="url(#coinBody)" />
          <Circle
            cx={C}
            cy={C}
            r={BODY}
            fill="none"
            stroke={METAL.outerEdge}
            strokeWidth={1.5}
          />
          <Circle
            cx={C}
            cy={C}
            r={R - 3}
            fill="none"
            stroke={METAL.innerEdge}
            strokeWidth={1}
          />
          {/* The engraved ring: a light edge just below the dark cut. */}
          <Circle
            cx={C}
            cy={C + 1.5}
            r={RING}
            fill="none"
            stroke={m.light}
            strokeWidth={3}
          />
          <Circle
            cx={C}
            cy={C}
            r={RING}
            fill="none"
            stroke={m.engrave}
            strokeWidth={3}
          />
          {peers.map((p, i) => (
            <React.Fragment key={i}>
              <Circle cx={p.x} cy={p.y + 1.2} r={10} fill={m.engrave} />
              <Circle
                cx={p.x}
                cy={p.y}
                r={9}
                fill="url(#coinRim)"
                stroke={m.engrave}
                strokeWidth={1.2}
              />
            </React.Fragment>
          ))}
          <SvgText
            x={C}
            y={zBaseline + 3}
            fill={m.light}
            fontFamily={fonts.serifMedium}
            fontSize={112}
            textAnchor="middle"
          >
            Z
          </SvgText>
          <SvgText
            x={C}
            y={zBaseline}
            fill={m.engrave}
            fontFamily={fonts.serifMedium}
            fontSize={112}
            textAnchor="middle"
          >
            Z
          </SvgText>
          <Circle cx={C} cy={C} r={BODY} fill="url(#coinSheen)" />
        </Svg>

        {plate ? (
          <View style={styles.plateRow}>
            <View style={styles.plate}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={styles.plateText}
              >
                {plate}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', width: S, height: S + 24 },
  plateRow: {
    position: 'absolute',
    top: C + 48,
    left: 0,
    width: S,
    alignItems: 'center',
  },
  plate: {
    minWidth: 112,
    maxWidth: 136,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1.2,
    borderColor: METAL.plateEdge,
    backgroundColor: METAL.plateInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    letterSpacing: 5,
    paddingLeft: 5,
    color: METAL.gold,
  },
});
