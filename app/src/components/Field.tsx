import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { fonts, makeStyles, space, useColors } from '../theme';

interface Props {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation' | 'url';
  maxLength?: number;
}

export function Field({ label, hint, ...input }: Props) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.gold}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  wrap: { gap: space.xs + 2 },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    fontFamily: fonts.sans,
    fontSize: 17,
    color: colors.text,
  },
  hint: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
}));
