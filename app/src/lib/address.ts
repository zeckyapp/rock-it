/** Where Rock it's status page answers on the Umbrel (the app's port). */
export const STATUS_PORT = 8138;
/** Where Lock it and Pocket connect (Zaino). */
export const WALLET_PORT = 8137;

export interface Address {
  host: string;
  port: number;
}

/**
 * Reads what the user typed: "192.168.1.20", "192.168.1.20:8138",
 * "http://umbrel.local:8138/". Returns null when it is not an address.
 */
export function parseAddress(text: string): Address | null {
  const cleaned = text
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const match = /^([a-z0-9]([a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?$/i.exec(
    cleaned,
  );
  if (match == null) return null;
  const port = match[3] == null ? STATUS_PORT : Number(match[3]);
  if (port < 1 || port > 65535) return null;
  return { host: match[1].toLowerCase(), port };
}

export function addressLabel(a: Address): string {
  return `${a.host}:${a.port}`;
}

function ipv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p))) {
    return null;
  }
  const numbers = parts.map(Number);
  return numbers.some(n => n > 255) ? null : numbers;
}

/** A Tailscale address (100.64.0.0/10) or a Tailscale name (*.ts.net). */
export function isTailscale(host: string): boolean {
  if (host.endsWith('.ts.net')) return true;
  const ip = ipv4(host);
  return ip != null && ip[0] === 100 && ip[1] >= 64 && ip[1] <= 127;
}

/**
 * A private address that never reaches the internet: the home network
 * (10/8, 172.16/12, 192.168/16, *.local), this phone (127/8) or Tailscale.
 * The same ranges Lock it and Pocket reach without TLS.
 */
export function isPrivate(host: string): boolean {
  if (host.endsWith('.local') || isTailscale(host)) return true;
  const ip = ipv4(host);
  if (ip == null) return false;
  const [a, b] = ip;
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}
