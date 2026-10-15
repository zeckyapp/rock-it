import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import {
  addressLabel,
  isPrivate,
  isTailscale,
  parseAddress,
} from '../lib/address';
import { checkRock } from '../lib/check';
import { cleanName, MAX_NAME, Rock, saveRock } from '../lib/rock';
import { RockError } from '../lib/status';
import { fonts, makeStyles, space } from '../theme';

interface Props {
  /** The Rock being changed, or null to add the first one. */
  rock: Rock | null;
  onDone: () => void;
  onCancel?: () => void;
}

export function SetupScreen({ rock, onDone, onCancel }: Props) {
  const styles = useStyles();
  const [name, setName] = useState(rock?.name ?? '');
  const [home, setHome] = useState(rock?.home ? addressLabel(rock.home) : '');
  const [away, setAway] = useState(rock?.away ? addressLabel(rock.away) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rock | null>(null);

  function build(): Rock | null {
    const h = home.trim() ? parseAddress(home) : null;
    const a = away.trim() ? parseAddress(away) : null;
    if (home.trim() && h == null) {
      setError(`"${home.trim()}" is not an address. Try 192.168.1.20.`);
      return null;
    }
    if (away.trim() && a == null) {
      setError(`"${away.trim()}" is not an address. Try 100.101.102.103.`);
      return null;
    }
    if (h == null && a == null) {
      setError('Enter at least one address for your Rock.');
      return null;
    }
    // Rock it only talks to the owner's own network (plain http, see
    // NSAllowsArbitraryLoads in Info.plist), never to the internet.
    if (h != null && !isPrivate(h.host)) {
      setError(
        'Use your Umbrel’s address on your home network, for example 192.168.1.20 or umbrel.local.',
      );
      return null;
    }
    if (a != null && !isTailscale(a.host)) {
      setError(
        'The away address should be your Umbrel’s Tailscale address. It starts with 100.',
      );
      return null;
    }
    return { name: cleanName(name), home: h, away: a };
  }

  async function connect() {
    setError(null);
    setDraft(null);
    const next = build();
    if (next == null) return;
    setBusy(true);
    try {
      await checkRock(next);
      saveRock(next);
      onDone();
    } catch (e) {
      setError(e instanceof RockError ? e.message : String(e));
      // Lets the owner save it anyway, e.g. while away from home.
      setDraft(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>Zecky Rock it</Text>
        <Text style={styles.title}>
          {rock ? 'Your Rock' : 'Find your Rock'}
        </Text>
        <Text style={styles.body}>
          Your node on the Umbrel at home. Rock it only reads how it is doing:
          no keys, no funds, nothing leaves your network.
        </Text>

        <View style={styles.fields}>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="My Rock"
            maxLength={MAX_NAME}
          />
          <Field
            label="At home"
            hint="Your Umbrel’s address on the Wi-Fi, for example 192.168.1.20 or umbrel.local."
            value={home}
            onChangeText={setHome}
            placeholder="192.168.1.20"
            keyboardType="url"
          />
          <Field
            label="Away (Tailscale)"
            hint="Optional. Your Umbrel’s Tailscale address, so you can check on it from anywhere."
            value={away}
            onChangeText={setAway}
            placeholder="100.x.x.x"
            keyboardType="url"
          />
        </View>

        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button label="Connect" onPress={connect} busy={busy} />
          {draft ? (
            <Button
              label="Save without checking"
              variant="quiet"
              onPress={() => {
                saveRock(draft);
                onDone();
              }}
            />
          ) : null}
          {onCancel ? (
            <Button label="Cancel" variant="quiet" onPress={onCancel} />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(colors => ({
  flex: { flex: 1 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
    marginTop: space.lg,
  },
  title: { fontFamily: fonts.serif, fontSize: 40, color: colors.text },
  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },
  fields: { gap: space.lg, marginTop: space.md },
  error: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.danger,
  },
  actions: { gap: space.sm + 4, marginTop: space.md },
}));
