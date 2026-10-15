import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import {
  Address,
  isPrivate,
  isTailscale,
  parseAddress,
  shortLabel,
} from '../lib/address';
import { checkRock } from '../lib/check';
import { clearKey, loadKey, saveKey } from '../lib/key';
import { scanQr } from 'rockit-tls';
import { cleanCode, PairLink, pairWith, parsePairLink } from '../lib/pair';
import { cleanName, MAX_NAME, Rock, saveRock } from '../lib/rock';
import { RockError } from '../lib/status';
import { fonts, makeStyles, space } from '../theme';

interface Props {
  /** The Rock being changed, or null to add the first one. */
  rock: Rock | null;
  /** A pairing link opened from the QR code on the Umbrel page. */
  link: PairLink | null;
  onDone: () => void;
  onCancel?: () => void;
  /** A pairing link read with the in-app scanner. */
  onLink: (link: PairLink) => void;
}

const DEVICE_NAME = Platform.OS === 'ios' && Platform.isPad ? 'iPad' : 'iPhone';

function initialHome(rock: Rock | null, link: PairLink | null): string {
  if (link && !isTailscale(link.address.host)) {
    return shortLabel(link.address);
  }
  if (rock?.home) return shortLabel(rock.home);
  return link ? '' : 'umbrel.local';
}

function initialAway(rock: Rock | null, link: PairLink | null): string {
  if (link && isTailscale(link.address.host)) {
    return shortLabel(link.address);
  }
  return rock?.away ? shortLabel(rock.away) : '';
}

export function SetupScreen({ rock, link, onDone, onCancel, onLink }: Props) {
  const styles = useStyles();
  const [name, setName] = useState(rock?.name ?? '');
  const [home, setHome] = useState(initialHome(rock, link));
  const [away, setAway] = useState(initialAway(rock, link));
  const [code, setCode] = useState(
    link ? `${link.code.slice(0, 4)}-${link.code.slice(4)}` : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rock | null>(null);
  const deviceId = rock?.deviceId ?? null;
  const paired = deviceId != null;

  function addresses(): { h: Address | null; a: Address | null } | null {
    const h = home.trim() ? parseAddress(home) : null;
    const a = away.trim() ? parseAddress(away) : null;
    if (home.trim() && h == null) {
      setError(`"${home.trim()}" is not an address. Try umbrel.local.`);
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
    return { h, a };
  }

  async function scan() {
    setError(null);
    let text: string | null;
    try {
      text = await scanQr();
    } catch (e) {
      const reason = (e as { code?: unknown } | null)?.code;
      setError(
        reason === 'denied'
          ? 'Camera access is off for Rock it. Turn it on in Settings, Rock it, or scan with the iPhone Camera app instead.'
          : 'This device has no camera. Type the code instead.',
      );
      return;
    }
    if (text == null) return; // cancelled
    const found = parsePairLink(text);
    if (found == null) {
      setError(
        'That QR code is not a Rock it pairing code. Scan the one on your Umbrel’s Rock it page.',
      );
      return;
    }
    onLink(found);
  }

  async function submit() {
    setError(null);
    setDraft(null);
    const found = addresses();
    if (found == null) return;
    const { h, a } = found;
    const typed = code.trim();
    const clean = typed ? cleanCode(typed) : null;
    if (typed && clean == null) {
      setError('The code has eight letters and numbers, like K7QM-3XPA.');
      return;
    }
    setBusy(true);
    try {
      if (clean) {
        // Pair through the address the code came from: the link's, or home.
        const target =
          link && a && isTailscale(link.address.host) ? a : h ?? (a as Address);
        // The QR's fingerprint; when re-pairing by hand, the one already kept.
        const pin = link ? link.pin : rock?.pin ?? null;
        const fresh = await pairWith(target, clean, DEVICE_NAME, pin);
        await saveKey(fresh.deviceId, fresh.key);
        saveRock({
          name: cleanName(name),
          home: h,
          away: a,
          deviceId: fresh.deviceId,
          pin: fresh.pin,
        });
        onDone();
        return;
      }
      const key = deviceId != null ? await loadKey() : null;
      if (deviceId == null || key == null) {
        setError('Enter the code shown on your Umbrel’s Rock it page.');
        return;
      }
      const next: Rock = {
        name: cleanName(name),
        home: h,
        away: a,
        deviceId,
        pin: rock?.pin ?? null,
      };
      try {
        await checkRock(next, key);
      } catch (e) {
        // Lets the owner save it anyway, e.g. while away from home.
        setDraft(next);
        throw e;
      }
      saveRock(next);
      onDone();
    } catch (e) {
      setError(e instanceof RockError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function forget() {
    Alert.alert(
      'Forget this Rock?',
      'This iPhone deletes its key. To fully remove it, also tap Remove next to this iPhone on your Umbrel’s Rock it page.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await clearKey();
            saveRock(null);
            onDone();
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>Zecky Rock it</Text>
        <Text style={styles.title}>
          {link ? 'Pair this iPhone' : paired ? 'Your Rock' : 'Pair your Rock'}
        </Text>

        {link ? (
          <Text style={styles.body}>
            Your Umbrel at {shortLabel(link.address)} sent a pairing code. Tap
            Pair to give this iPhone its own key.
          </Text>
        ) : paired ? (
          <Text style={styles.body}>
            Change the name or addresses. To pair again, type a new code from
            your Umbrel.
          </Text>
        ) : (
          <View style={styles.steps}>
            <Text style={styles.body}>
              Rock it only reads how your node is doing: no keys to your money,
              no funds. Only paired iPhones can read it.
            </Text>
            <Text style={styles.step}>
              1. On your Umbrel, open Zecky Rock it.
            </Text>
            <Text style={styles.step}>
              2. Tap Scan and point at the QR code on that page.
            </Text>
            <Text style={styles.step}>
              3. Or type the code below. Scanning is safer: the QR also carries
              your Rock’s fingerprint, so the app can tell it apart from
              anything else on your Wi-Fi.
            </Text>
          </View>
        )}

        {link ? null : <Button label="Scan the QR code" onPress={scan} />}

        <View style={styles.fields}>
          <Field
            label="Code"
            hint={
              paired && !link
                ? 'Only to pair again. Leave empty to keep this pairing.'
                : 'Eight letters and numbers from your Umbrel, valid for ten minutes.'
            }
            value={code}
            onChangeText={setCode}
            placeholder="K7QM-3XPA"
            maxLength={12}
          />
          <Field
            label="At home"
            hint="Your Umbrel on the Wi-Fi: umbrel.local or its number, like 192.168.1.20."
            value={home}
            onChangeText={setHome}
            placeholder="umbrel.local"
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
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="My Rock"
            maxLength={MAX_NAME}
          />
        </View>

        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={code.trim() || !paired ? 'Pair' : 'Save'}
            onPress={submit}
            busy={busy}
          />
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
          {paired && !link ? (
            <Button label="Forget this Rock" variant="quiet" onPress={forget} />
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
  steps: { gap: space.sm },
  step: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
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
