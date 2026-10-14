import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

// Zecky brand tokens, the same as Lock it and Pocket. Font names are the
// PostScript names of the files in assets/fonts, which is what iOS matches on.

export interface Palette {
  /** App background. */
  ink: string;
  /** Cards and input fields. */
  inkRaised: string;
  line: string;
  /** Accent: primary buttons, links, highlights. */
  gold: string;
  goldDim: string;
  /** Text and icons drawn on top of the gold accent. */
  onGold: string;
  text: string;
  textMuted: string;
  danger: string;
  ok: string;
}

export const palette: Palette = {
  ink: '#14161C',
  inkRaised: '#1C1F27',
  line: '#2A2E39',
  gold: '#D4A657',
  goldDim: '#8C7340',
  onGold: '#14161C',
  text: '#F2EFE8',
  textMuted: '#9A9CA5',
  danger: '#D9705F',
  ok: '#7FB58A',
};

export const fonts = {
  serif: 'Newsreader-Regular',
  serifMedium: 'Newsreader-Medium',
  sans: 'Inter-Regular',
  sansMedium: 'Inter-Medium',
  sansSemiBold: 'Inter-SemiBold',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };

/** Rock it is drawn dark only for now, like a box humming in the corner. */
export function useColors(): Palette {
  return palette;
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Like StyleSheet.create, written the same way as in Lock it so screens can
 * move between the apps:
 *   const useStyles = makeStyles(colors => ({ title: { color: colors.text } }));
 */
export function makeStyles<T extends NamedStyles>(
  build: (colors: Palette) => T & NamedStyles,
): () => T {
  return function useStyles() {
    const colors = useColors();
    return useMemo(
      () => StyleSheet.create(build(colors)) as unknown as T,
      [colors],
    );
  };
}
