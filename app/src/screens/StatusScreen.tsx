import Clipboard from '@react-native-clipboard/clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ProgressRing } from '../components/ProgressRing';
import { Address, WALLET_PORT } from '../lib/address';
import { checkRock, Reached } from '../lib/check';
import { loadKey } from '../lib/key';
import { Rock } from '../lib/rock';
import { formatGB, RockError, summarize } from '../lib/status';
import { fonts, makeStyles, space, useColors } from '../theme';

const POLL_MS = 10_000;

interface Props {
  rock: Rock;
  onEdit: () => void;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}

export function StatusScreen({ rock, onEdit }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const [reached, setReached] = useState<Reached | null>(null);
  const [error, setError] = useState<RockError | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [, tick] = useState(0);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const key = rock.deviceId != null ? await loadKey() : null;
      if (key == null) {
        throw new RockError(
          'This iPhone is not paired with your Rock yet. Pair it with the code on your Umbrel.',
          'unpaired',
        );
      }
      const r = await checkRock(rock, key);
      setReached(r);
      setError(null);
    } catch (e) {
      setError(
        e instanceof RockError ? e : new RockError(String(e), 'unreachable'),
      );
    } finally {
      setCheckedAt(Date.now());
      running.current = false;
    }
  }, [rock]);

  // Check now, then every ten seconds while the app is open.
  useEffect(() => {
    setReached(null);
    setError(null);
    check();
    let timer: ReturnType<typeof setInterval> | null = setInterval(
      check,
      POLL_MS,
    );
    const clock = setInterval(() => tick(n => n + 1), 5000);
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        check();
        if (timer == null) timer = setInterval(check, POLL_MS);
      } else if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer != null) clearInterval(timer);
      clearInterval(clock);
      sub.remove();
    };
  }, [check]);

  const status = error ? null : reached?.status ?? null;
  const summary = status ? summarize(status) : null;
  const waiting = status == null && error == null;

  function copy(address: Address) {
    const text = `${address.host}:${WALLET_PORT}`;
    Clipboard.setString(text);
    setCopied(text);
    setTimeout(() => setCopied(c => (c === text ? null : c)), 2000);
  }

  const walletAddresses: { label: string; address: Address }[] = [];
  if (rock.home) walletAddresses.push({ label: 'At home', address: rock.home });
  if (rock.away) walletAddresses.push({ label: 'Away', address: rock.away });

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.gold}
          onRefresh={async () => {
            setRefreshing(true);
            await check();
            setRefreshing(false);
          }}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>My Rock</Text>
          <Text style={styles.name} numberOfLines={1}>
            {rock.name}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          hitSlop={12}
          style={({ pressed }) => pressed && styles.dim}
        >
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <ProgressRing progress={summary?.progress ?? 0} muted={error != null} />
        <View style={styles.heroText} pointerEvents="none">
          <Text
            style={[styles.headline, summary?.tone === 'ok' && styles.live]}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {waiting ? 'Looking…' : summary?.headline ?? 'Out of reach'}
          </Text>
        </View>
      </View>

      <Text style={styles.detail} accessibilityLiveRegion="polite">
        {error ? error.message : summary?.detail ?? 'Knocking on your Rock.'}
      </Text>
      {error?.kind === 'unpaired' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [styles.copy, pressed && styles.dim]}
        >
          <Text style={styles.copyValue}>Pair again</Text>
        </Pressable>
      ) : null}
      {error?.kind === 'unreachable' ? (
        <Text style={styles.help}>
          {rock.away
            ? 'At home, check that the phone is on your Wi-Fi. Away, check that Tailscale is on, on the phone and on the Umbrel.'
            : 'Check that the phone is on the same Wi-Fi as your Umbrel. To check from anywhere, add its Tailscale address under Edit.'}
        </Text>
      ) : null}

      {status ? (
        <View style={styles.card}>
          <Row
            label="Reached"
            value={reached?.via === 'away' ? 'Through Tailscale' : 'At home'}
          />
          <Row
            label="Peers"
            value={status.node.peers == null ? '–' : String(status.node.peers)}
          />
          {status.disk ? (
            <Row
              label="Drive"
              value={`${formatGB(status.disk.free)} free of ${formatGB(
                status.disk.total,
              )}`}
            />
          ) : null}
          {status.privacy ? (
            <Row
              label="Privacy"
              value={
                status.privacy.inbound
                  ? 'Open to other nodes'
                  : 'Private, connects out only'
              }
            />
          ) : null}
          <Row
            label="Wallets"
            value={status.walletServer.open ? 'Can connect' : 'Not yet'}
            last={!status.version}
          />
          {status.version ? (
            <Row label="Version" value={status.version} last />
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>For Lock it and Pocket</Text>
        <Text style={styles.help}>
          In the wallet: Settings, Network, Add a server. Tap to copy.
        </Text>
        {walletAddresses.map(({ label, address }) => {
          const text = `${address.host}:${WALLET_PORT}`;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityHint="Copies the address"
              onPress={() => copy(address)}
              style={({ pressed }) => [styles.copy, pressed && styles.dim]}
            >
              <Text style={styles.copyLabel}>{label}</Text>
              <Text style={styles.copyValue}>
                {copied === text ? 'Copied' : text}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {checkedAt ? (
        <Text style={styles.footer}>Checked {ago(Date.now() - checkedAt)}</Text>
      ) : null}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.gold,
  },
  name: { fontFamily: fonts.serif, fontSize: 28, color: colors.text },
  link: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.gold },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  heroText: {
    position: 'absolute',
    left: space.xl + 20,
    right: space.xl + 20,
    alignItems: 'center',
  },
  headline: { fontFamily: fonts.serif, fontSize: 38, color: colors.text },
  live: { color: colors.gold },
  detail: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  help: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  card: {
    marginTop: space.md,
    borderRadius: 14,
    backgroundColor: colors.inkRaised,
    paddingHorizontal: space.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: space.md,
  },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.textMuted },
  rowValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right',
  },
  section: { gap: space.sm, marginTop: space.lg },
  sectionTitle: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.text,
  },
  copy: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: space.md,
    minHeight: 52,
    gap: space.md,
  },
  copyLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.textMuted },
  copyValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.md,
  },
}));
