import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Defs,
  G,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, makeStyles, space, useColors } from '../../theme';
import { wavyRing } from './metal';

const CORNER = 320;

/** A quarter of the medallion, peeking in from the top-right corner (as in Lock it). */
function Corner() {
  const colors = useColors();
  const rings = useMemo(() => {
    const out: string[] = [];
    const c = CORNER / 2;
    for (let k = 0; k < 7; k++) {
      for (let copy = 0; copy < 3; copy++) {
        const phase = ((copy / 3) * 2 * Math.PI) / 40;
        out.push(wavyRing(c, c, 60 + k * 18, 6, 40, phase, 360, 0));
      }
    }
    return out;
  }, []);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.corner}
    >
      <Svg width={CORNER} height={CORNER}>
        <Defs>
          <RadialGradient id="cornerFade" cx="50%" cy="50%" r="53%">
            <Stop offset="0.24" stopColor="#FFF" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFF" stopOpacity={0} />
          </RadialGradient>
          <Mask id="cornerMask">
            <Rect width={CORNER} height={CORNER} fill="url(#cornerFade)" />
          </Mask>
        </Defs>
        <G mask="url(#cornerMask)">
          {rings.map((d, i) => (
            <Path
              key={i}
              d={d}
              fill="none"
              stroke={colors.gold}
              strokeOpacity={0.07}
              strokeWidth={0.6}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
}

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * A full-screen panel in the Lock it style: the guilloché corner, a small
 * gold ZECKY label, a serif title, the content and Done at the bottom.
 */
export function Panel({ visible, title, subtitle, onClose, children }: Props) {
  const s = useStyles();
  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={s.root}>
        <Corner />
        <ScrollView contentContainerStyle={s.page}>
          <View style={s.header}>
            <Text style={s.label}>ZECKY</Text>
            <Text style={s.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle != null ? (
              <Text style={s.subtitle}>{subtitle}</Text>
            ) : null}
          </View>
          {children}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [s.done, pressed && s.dim]}
        >
          <Text style={s.doneText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = makeStyles(colors => ({
  root: { flex: 1, backgroundColor: colors.ink, overflow: 'hidden' },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  header: { gap: 6, marginBottom: space.sm, marginTop: space.md },
  label: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 4,
    color: colors.gold,
  },
  title: { fontFamily: fonts.serifMedium, fontSize: 30, color: colors.text },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  done: {
    alignSelf: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  doneText: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.gold },
  dim: { opacity: 0.6 },
}));

const styles = StyleSheet.create({
  corner: { position: 'absolute', top: -120, right: -120 },
});
