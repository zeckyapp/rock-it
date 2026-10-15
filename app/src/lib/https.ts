import { pinnedRequest } from 'rockit-tls';
import { Address, addressLabel } from './address';
import { RockError } from './status';

export interface RockReply {
  status: number;
  /** The JSON body, or null when it was not JSON. */
  json: Record<string, unknown> | null;
  /** The fingerprint of the certificate the Rock showed. */
  pin: string;
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
    throw new RockError(
      `No answer from ${addressLabel(address)}.`,
      'unreachable',
    );
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
