import { pinnedRequest } from 'rockit-tls';
import { Address, addressLabel, isTailscale } from './address';
import { RockError } from './status';

export interface RockReply {
  status: number;
  /** The JSON body, or null when it was not JSON. */
  json: Record<string, unknown> | null;
  /** The fingerprint of the certificate the Rock showed. */
  pin: string;
}

/**
 * What to check when the Rock does not answer. At home iOS also asks, once,
 * whether Rock it may use the local network; "Don't Allow" looks exactly like
 * a Rock that is off.
 */
export function noAnswer(address: Address): string {
  const where = addressLabel(address);
  if (isTailscale(address.host)) {
    return `No answer from ${where}. Check that Tailscale is on, on this phone, and that Connect is on on your Rock it page.`;
  }
  return `No answer from ${where}. Check that this phone is on the same Wi-Fi as your Umbrel, and that Rock it may use your local network (Settings › Rock it › Local Network).`;
}

/**
 * One HTTPS request to the Rock, trusting only the certificate with this
 * fingerprint. An empty pin is only for learning the fingerprint once, when a
 * code was typed by hand. Throws a RockError.
 */
export async function rockRequest(
  address: Address,
  path: string,
  options: {
    pin: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
  },
): Promise<RockReply> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let reply;
  try {
    reply = await pinnedRequest(`https://${addressLabel(address)}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? '' : JSON.stringify(options.body),
      pin: options.pin,
      timeoutMs: options.timeoutMs,
    });
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === 'pin') {
      throw new RockError(
        `${addressLabel(
          address,
        )} is not the Rock this iPhone was paired with: its certificate is different. If you reinstalled Rock it on the Umbrel, pair again.`,
        'pin',
      );
    }
    if (code === 'missing') {
      throw new RockError(
        'This build of the app has no encrypted connection. Rebuild it after pod install.',
        'unreachable',
      );
    }
    throw new RockError(noAnswer(address), 'unreachable');
  }
  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(reply.body);
    if (parsed != null && typeof parsed === 'object') {
      json = parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON.
  }
  return { status: reply.status, json, pin: reply.pin };
}
