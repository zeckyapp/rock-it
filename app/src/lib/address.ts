/** Where Rock it's status page answers on the Umbrel (the app's port). */
export const STATUS_PORT = 8138;
/** Where the Rock answers this app: HTTPS with its own certificate. */
export const PHONE_PORT = 8139;
/** Where Lock it and Pocket connect (Zaino). */
export const WALLET_PORT = 8137;

export interface Address {
  host: string;
  port: number;
}

/**
 * Reads what the user typed: "192.168.1.20", "192.168.1.20:8139",
 * "https://umbrel.local/". Returns null when it is not an address. Without a
 * port it is the Rock's HTTPS port for this app.
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
  let port = match[3] == null ? PHONE_PORT : Number(match[3]);
  // The wallet port (8137) and the page (8138) are on the same Umbrel; this
  // app always talks to the Rock on its own port.
  if (port === WALLET_PORT || port === STATUS_PORT) port = PHONE_PORT;
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
