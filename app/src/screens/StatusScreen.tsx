import Clipboard from '@react-native-clipboard/clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrassButton } from '../components/rock/BrassButton';
import { Medallion } from '../components/rock/Medallion';
import { Panel } from '../components/rock/Panel';
import { RockCoin } from '../components/rock/RockCoin';
import { SyncRing } from '../components/rock/SyncRing';
import { Address, WALLET_PORT } from '../lib/address';
import { version as APP_VERSION } from '../../package.json';
import { checkRock, Reached } from '../lib/check';
import { loadKey } from '../lib/key';
import { Rock } from '../lib/rock';
import { formatGB, hero, RockError, tiles } from '../lib/status';
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

/**
 * The main screen, in the Lock it layout: the Rock it coin on its
 * guilloché medallion with the sync ring around it, one big number, two
 * calm lines, one brass button, and a bottom bar. Everything else lives in
 * the Connect a wallet and Details panels.
 */
export function StatusScreen({ rock, onEdit }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [reached, setReached] = useState<Reached | null>(null);
  const [error, setError] = useState<RockError | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [wallets, setWallets] = useState(false);
  const [details, setDetails] = useState(false);
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
  const h = hero(status, error != null);
  const via =
    status && reached
      ? reached.via === 'away'
        ? 'Through Tailscale'
        : 'At home'
      : null;

  // The hero shrinks on small iPhones so the screen fits without scrolling,
  // and fades in once that room is measured (as in Lock it).
  const [area, setArea] = useState(0);
  const below = 250 + (error ? 90 : 0);
  const heroScale =
    area === 0 ? 1 : Math.min(1, Math.max(0.5, (area - below) / 396));
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (area > 0) {
      Animated.timing(fade, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }
  }, [area, fade]);

  function copy(text: string) {
    Clipboard.setString(text);
    setCopied(text);
    setTimeout(() => setCopied(c => (c === text ? null : c)), 2000);
  }

  // The wallet port as the Rock reports it; 8137 until it has answered.
  const walletPort = status?.walletServer.port ?? WALLET_PORT;
  const anywhere = status?.otherWallets ?? null;
  const walletAddresses: { label: string; address: Address }[] = [];
  if (rock.home) {
    walletAddresses.push({
      label: anywhere ? 'At home (Wi-Fi only)' : 'At home',
      address: rock.home,
    });
  }
  // With Connect on, the encrypted address replaces the plain Tailscale one.
  if (rock.away && !anywhere) {
    walletAddresses.push({ label: 'Away', address: rock.away });
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.wordmark}>
          <Text style={styles.brand}>ZECKY</Text>
          <Text style={styles.product}>Rock it</Text>
        </View>
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={e => setArea(e.nativeEvent.layout.height)}
        style={{ opacity: fade }}
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
        <View style={styles.spaceAbove} />
        <View
          style={[styles.hero, { height: Math.round(396 * heroScale) }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Your Rock: ${h.status}`}
        >
          <View style={styles.heroLayer} pointerEvents="none">
            <Medallion diameter={Math.round(700 * heroScale)} />
          </View>
          <View
            style={[styles.heroLayer, h.tone !== 'ok' && styles.ringWaiting]}
            pointerEvents="none"
          >
            <SyncRing
              progress={h.progress}
              diameter={Math.round(364 * heroScale)}
            />
          </View>
          <RockCoin
            plate={h.plate}
            dull={h.tone === 'off'}
            size={Math.round(236 * heroScale)}
          />
        </View>

        <View style={styles.valueRow} accessible>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {h.value}
          </Text>
          {h.unit ? <Text style={styles.unit}> {h.unit}</Text> : null}
        </View>
        <Text style={styles.line}>{h.line}</Text>
        {h.accent || h.rest ? (
          <Text style={styles.line}>
            {h.accent ? <Text style={styles.accent}>{h.accent}</Text> : null}
            {h.rest}
          </Text>
        ) : null}

        {error ? (
          <Text style={styles.calm}>
            {error.message}
            {error.kind === 'unreachable'
              ? rock.away
                ? ' At home, check that the phone is on your Wi-Fi and that Rock it may use your local network (Settings › Rock it › Local Network). Away, check that Tailscale is on, on the phone and on the Umbrel.'
                : ' Check that the phone is on the same Wi-Fi as your Umbrel, and that Rock it may use your local network (Settings › Rock it › Local Network). To check from anywhere, add its Tailscale address in Settings.'
              : ''}
          </Text>
        ) : null}

        <View style={styles.brass}>
          {error?.kind === 'unpaired' || error?.kind === 'pin' ? (
            <BrassButton label="Pair again" icon={null} onPress={onEdit} />
          ) : (
            <BrassButton
              label="Connect a wallet"
              onPress={() => setWallets(true)}
            />
          )}
        </View>
        <View style={styles.spaceBelow} />
      </Animated.ScrollView>

      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, space.sm) },
        ]}
      >
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              h.tone === 'ok' && styles.dotOk,
              h.tone === 'off' && styles.dotOff,
            ]}
          />
          <Text style={styles.status} numberOfLines={1}>
            {h.status}
            {via ? ` · ${via}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => setDetails(true)}
        >
          <Text style={styles.link}>Details</Text>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onEdit}>
          <Text style={[styles.link, styles.linkGap]}>Settings</Text>
        </Pressable>
      </View>

      <Panel
        visible={wallets}
        title="Connect a wallet"
        subtitle="In the wallet: Settings, Network, Add a server. Tap an address to copy it."
        onClose={() => setWallets(false)}
      >
        {anywhere ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Copies the address"
              onPress={() => copy(anywhere.address)}
              style={({ pressed }) => [styles.copyWide, pressed && styles.dim]}
            >
              <Text style={styles.copyLabel}>Anywhere · encrypted</Text>
              <Text style={styles.copyValue}>
                {copied === anywhere.address ? 'Copied' : anywhere.address}
              </Text>
            </Pressable>
            <Text style={styles.help}>
              Lock it, Pocket, Vizor: paste as is. Zodl: leave out https://.
              Keep Tailscale on on your phone, also at home.
            </Text>
          </>
        ) : null}
        {walletAddresses.map(({ label, address }) => {
          const text = `${address.host}:${walletPort}`;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityHint="Copies the address"
              onPress={() => copy(text)}
              style={({ pressed }) => [styles.copy, pressed && styles.dim]}
            >
              <Text style={styles.copyLabel}>{label}</Text>
              <Text style={styles.copyValueSmall}>
                {copied === text ? 'Copied' : text}
              </Text>
            </Pressable>
          );
        })}
        {rock.home ? (
          <Text style={styles.help}>
            Only on your own Wi-Fi, never a guest or public network. Away, or on
            any other network, use the Tailscale address: it is encrypted.
          </Text>
        ) : null}
        {status && !anywhere ? (
          <Text style={styles.help}>
            Turn on Connect on your Rock it page for one encrypted address that
            works everywhere, for every wallet.
          </Text>
        ) : null}
      </Panel>

      <Panel
        visible={details}
        title="Details"
        subtitle={rock.name}
        onClose={() => setDetails(false)}
      >
        {status ? (
          <View style={styles.tiles}>
            {tiles(status).map(t => (
              <View
                key={t.title}
                style={styles.tile}
                accessible
                accessibilityLabel={`${t.title}: ${t.text} ${t.subtext}`.trim()}
              >
                <Text style={styles.tileTitle}>{t.title}</Text>
                <Text
                  style={styles.tileText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {t.text}
                </Text>
                <Text style={styles.tileSub} numberOfLines={1}>
                  {/* An empty line keeps all four tiles the same height. */}
                  {t.subtext || ' '}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.help}>
            {error ? error.message : 'Knocking on your Rock.'}
          </Text>
        )}
        <View style={styles.card}>
          <Row label="Reached" value={via ?? '–'} />
          {status?.disk ? (
            <Row
              label="Drive"
              value={`${formatGB(status.disk.free)} free of ${formatGB(
                status.disk.total,
              )}`}
            />
          ) : null}
          <Row label="Rock it on Umbrel" value={status?.version || '–'} />
          <Row label="Rock it app" value={APP_VERSION} />
          <Row
            label="Checked"
            value={checkedAt ? ago(Date.now() - checkedAt) : '–'}
            last
          />
        </View>
      </Panel>
    </View>
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
  container: { flex: 1, backgroundColor: colors.ink },
  dim: { opacity: 0.6 },
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    zIndex: 1,
  },
  wordmark: { flexDirection: 'row', alignItems: 'baseline' },
  brand: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    letterSpacing: 5.5,
    color: colors.gold,
  },
  product: {
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.textMuted,
    marginLeft: 6,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  spaceAbove: { flexGrow: 1.6 },
  spaceBelow: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  heroLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -space.lg,
    right: -space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWaiting: { opacity: 0.6 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  value: {
    fontFamily: fonts.serifMedium,
    fontSize: 52,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  unit: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textMuted },
  line: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.xs + 2,
    fontVariant: ['tabular-nums'],
  },
  accent: { fontFamily: fonts.sansMedium, color: colors.gold },
  calm: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: space.md,
  },
  brass: { alignSelf: 'center', width: 230, marginTop: space.lg },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: colors.line,
    paddingTop: space.sm + 2,
    paddingHorizontal: space.md + 4,
  },
  statusRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gold,
    marginRight: space.sm,
  },
  dotOk: { backgroundColor: colors.ok },
  dotOff: { backgroundColor: colors.danger },
  status: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
  },
  linkGap: { marginLeft: space.md + 4 },
  link: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: space.md,
  },
  help: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 14,
    backgroundColor: colors.inkRaised,
    paddingHorizontal: space.md,
    paddingVertical: 14,
  },
  tileTitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
  tileText: {
    fontFamily: fonts.serif,
    fontSize: 30,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  tileSub: { fontFamily: fonts.sans, fontSize: 13, color: colors.textMuted },
  card: {
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
  copyWide: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    gap: 4,
  },
  copyLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.textMuted },
  copyValue: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.gold,
  },
  copyValueSmall: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.gold,
    fontVariant: ['tabular-nums'],
  },
}));
