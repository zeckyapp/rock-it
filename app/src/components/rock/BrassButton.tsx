import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { fonts } from '../../theme';

interface Props {
  label: string;
  onPress: () => void;
  /** A small link symbol before the label. */
  icon?: 'link' | null;
}

const INK = '#3A2A0C';

/**
 * The main action on the home screen, in brass: the same button as Zecky
 * Lock it, with a brushed gradient and an engraved label.
 */
export function BrassButton({ label, onPress, icon = 'link' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.base, pressed && styles.pressed]}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F6E2B0" />
            <Stop offset="0.48" stopColor="#D9AE5F" />
            <Stop offset="0.52" stopColor="#B88A3E" />
            <Stop offset="1" stopColor="#9C7330" />
          </LinearGradient>
          <LinearGradient id="brassSheen" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFF" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#FFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" rx={12} fill="url(#brass)" />
        <Rect width="100%" height="100%" rx={12} fill="url(#brassSheen)" />
      </Svg>
      <View style={styles.innerEdge} pointerEvents="none" />
      <View style={styles.row}>
        {icon === 'link' ? (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"
              stroke={INK}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(94, 69, 25, 0.8)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D4A657',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  pressed: { transform: [{ scale: 0.985 }], shadowOpacity: 0.4 },
  innerEdge: {
    position: 'absolute',
    top: 1.5,
    left: 1.5,
    right: 1.5,
    bottom: 1.5,
    borderRadius: 10.5,
    borderWidth: 1,
    borderColor: 'rgba(255, 243, 209, 0.45)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    letterSpacing: 0.3,
    color: INK,
    textShadowColor: 'rgba(255, 243, 209, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
