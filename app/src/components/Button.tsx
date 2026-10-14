import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { fonts, makeStyles, space, useColors } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet';
  busy?: boolean;
  disabled?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
}: Props) {
  const colors = useColors();
  const styles = useStyles();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.quiet,
        (pressed || disabled) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onGold : colors.gold} />
      ) : (
        <Text style={[styles.label, !primary && styles.quietLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(colors => ({
  base: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  primary: { backgroundColor: colors.gold },
  quiet: { borderWidth: 1, borderColor: colors.line },
  dim: { opacity: 0.6 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.onGold },
  quietLabel: { color: colors.text },
}));
