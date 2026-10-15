import { Address, addressLabel } from './address';

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
    readonly kind: 'unreachable' | 'login' | 'notRockIt' | 'unpaired' | 'code',
  ) {
    super(message);
  }
}

/**
 * Asks one address for the status, with this phone's key from pairing.
 * Throws a RockError.
 */
export async function fetchStatus(
  address: Address,
  key: string,
  timeoutMs = 5000,
): Promise<RockStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`http://${addressLabel(address)}/phone/status`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch {
    throw new RockError(
      `No answer from ${addressLabel(address)}.`,
      'unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An Umbrel login page is HTML, not JSON.
  }
  const status = response.ok ? parseStatus(body) : null;
  if (status != null) return status;
  if (
    response.status === 401 &&
    (body as { error?: unknown } | null)?.error === 'unpaired'
  ) {
    throw new RockError(
      'This iPhone is no longer paired with your Rock. Pair it again with the code on your Umbrel.',
      'unpaired',
    );
  }
  if (response.status === 401 || response.redirected || body == null) {
    throw new RockError(
      'Your Umbrel asked for a login. Update Zecky Rock it on the Umbrel to version 0.2.0 or newer.',
      'login',
    );
  }
  throw new RockError(
    `${addressLabel(address)} answered, but it is not Rock it.`,
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
        detail: 'The node is waking up.',
        progress: 0,
        tone: 'busy',
      };
    case 'syncing': {
      const p = Math.min(Math.max(s.node.progress ?? 0, 0), 1);
      return {
        headline: `Syncing ${(Math.floor(p * 1000) / 10).toFixed(1)}%`,
        detail: `Block ${fmt(height)} of about ${fmt(estimated)}`,
        progress: p,
        tone: 'busy',
      };
    }
    case 'opening':
      return {
        headline: 'Almost ready',
        detail: 'The chain is in. Opening the door for your wallets.',
        progress: 1,
        tone: 'busy',
      };
    case 'ready':
      return {
        headline: 'Live',
        detail: `Block ${fmt(height)}`,
        progress: 1,
        tone: 'ok',
      };
  }
}
