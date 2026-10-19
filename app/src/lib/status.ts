import { Address, addressLabel } from './address';
import { rockRequest } from './https';

/** What the Rock it status page reports (status/server.py, /api/status). */
export interface RockStatus {
  phase: 'starting' | 'syncing' | 'opening' | 'ready';
  node: {
    reachable: boolean;
    chain?: string;
    height?: number;
    estimatedHeight?: number;
    progress?: number;
    peers?: number | null;
    /** Shielded and total ZEC in zatoshi (Rock it 0.3.6 and newer). */
    pools?: { shieldedZat: number; totalZat: number } | null;
  };
  walletServer: { open: boolean; port: number };
  disk: { free: number; total: number } | null;
  /** Whether other Zcash nodes can connect in (null on older Rocks). */
  privacy: { inbound: boolean } | null;
  version: string;
}

const PHASES = ['starting', 'syncing', 'opening', 'ready'] as const;

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Checks the shape of a status reply. Returns null if it is not one. */
export function parseStatus(raw: unknown): RockStatus | null {
  if (raw == null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!PHASES.includes(r.phase as RockStatus['phase'])) return null;
  const node = (r.node ?? {}) as Record<string, unknown>;
  const ws = (r.walletServer ?? {}) as Record<string, unknown>;
  const disk = r.disk as Record<string, unknown> | null | undefined;
  const pv = r.privacy as Record<string, unknown> | null | undefined;
  const pl = node.pools as Record<string, unknown> | null | undefined;
  const shieldedZat = num(pl?.shieldedZat);
  const totalZat = num(pl?.totalZat);
  const free = num(disk?.free);
  const total = num(disk?.total);
  return {
    phase: r.phase as RockStatus['phase'],
    node: {
      reachable: node.reachable === true,
      chain: typeof node.chain === 'string' ? node.chain : undefined,
      height: num(node.height),
      estimatedHeight: num(node.estimatedHeight),
      progress: num(node.progress),
      peers: num(node.peers) ?? null,
      pools:
        shieldedZat != null && totalZat != null && totalZat > 0
          ? { shieldedZat, totalZat }
          : null,
    },
    walletServer: {
      open: ws.open === true,
      port: num(ws.port) ?? 8137,
    },
    disk: free != null && total != null ? { free, total } : null,
    privacy:
      pv != null && typeof pv.inbound === 'boolean'
        ? { inbound: pv.inbound }
        : null,
    version: typeof r.version === 'string' ? r.version : '',
  };
}

/** Why a check failed, in words the owner can act on. */
export class RockError extends Error {
  constructor(
    message: string,
    readonly kind:
      | 'unreachable'
      | 'login'
      | 'notRockIt'
      | 'unpaired'
      | 'code'
      | 'pin',
  ) {
    super(message);
  }
}

/**
 * Asks one address for the status over HTTPS, with this phone's key from
 * pairing and the Rock's certificate fingerprint. Throws a RockError.
 */
export async function fetchStatus(
  address: Address,
  key: string,
  pin: string,
  timeoutMs = 6000,
): Promise<RockStatus> {
  if (!pin) {
    throw new RockError(
      'Pair this iPhone again to switch to the encrypted connection.',
      'unpaired',
    );
  }
  const reply = await rockRequest(address, '/phone/status', {
    pin,
    headers: { Authorization: `Bearer ${key}` },
    timeoutMs,
  });
  const status = reply.status === 200 ? parseStatus(reply.json) : null;
  if (status != null) return status;
  if (reply.status === 401 && reply.json?.error === 'unpaired') {
    throw new RockError(
      'This iPhone is no longer paired with your Rock. Pair it again with the code on your Umbrel.',
      'unpaired',
    );
  }
  throw new RockError(
    `${addressLabel(address)} answered, but it is not Rock it 0.3.0 or newer.`,
    'notRockIt',
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function formatGB(bytes: number): string {
  return `${fmt(bytes / 1e9)} GB`;
}

export interface Summary {
  /** Big word on the screen. */
  headline: string;
  /** One line under it. */
  detail: string;
  /** 0 to 1 for the ring. */
  progress: number;
  tone: 'ok' | 'busy';
}

/** Turns a status into what the main screen says. */
export function summarize(s: RockStatus): Summary {
  const height = s.node.height ?? 0;
  const estimated = Math.max(s.node.estimatedHeight ?? 0, height);
  switch (s.phase) {
    case 'starting':
      return {
        headline: 'Starting',
        detail: 'The node is starting',
        progress: 0,
        tone: 'busy',
      };
    case 'syncing': {
      const p = Math.min(Math.max(s.node.progress ?? 0, 0), 1);
      return {
        headline: `${(Math.floor(p * 1000) / 10).toFixed(1)}%`,
        detail: `Syncing · block ${fmt(height)} of ${fmt(estimated)}`,
        progress: p,
        tone: 'busy',
      };
    }
    case 'opening':
      return {
        headline: 'Almost ready',
        detail: 'Opening the wallet port',
        progress: 1,
        tone: 'busy',
      };
    case 'ready':
      return {
        headline: 'Synced',
        detail: `Block ${fmt(height)} · checked by you`,
        progress: 1,
        tone: 'ok',
      };
  }
}

export interface Tile {
  title: string;
  text: string;
  subtext: string;
}

/** The four tiles, with the same words as the Umbrel's Zcash node widget. */
export function tiles(s: RockStatus): Tile[] {
  const n = s.node;
  const p = n.reachable ? n.pools : null;
  const peers = n.reachable ? n.peers : null;
  return [
    {
      title: 'Shielded',
      text: p ? `${((p.shieldedZat * 100) / p.totalZat).toFixed(0)}%` : '–',
      subtext: 'of ZEC',
    },
    {
      title: 'Network',
      text: peers == null ? '–' : fmt(peers),
      subtext: 'peers',
    },
    {
      title: 'Wallets',
      text: s.walletServer.open ? 'Ready' : 'Not ready',
      subtext: '',
    },
    // Rock it is Private only: it never announces the home IP as a node.
    { title: 'Mode', text: 'Private', subtext: 'node' },
  ];
}
