import { Address, addressLabel, isPrivate, STATUS_PORT } from './address';
import { RockError } from './status';

/** The letters the Umbrel uses for codes: no 0/O and no 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** "abcd-efgh" -> "ABCDEFGH", or null when it cannot be a code. */
export function cleanCode(text: string): string | null {
  const code = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every(c => CODE_ALPHABET.includes(c)) ? code : null;
}

export interface PairLink {
  address: Address;
  code: string;
}

/**
 * Reads the link in the Umbrel page's QR code:
 *   rockit://pair?h=umbrel.local&p=8138&c=ABCDEFGH
 * Only private addresses (home network, Tailscale) are accepted, so a link
 * from a website cannot pair the app with a server on the internet.
 */
export function parsePairLink(url: string): PairLink | null {
  const match = /^rockit:\/\/pair\/?\?(.*)$/i.exec(url.trim());
  if (match == null) return null;
  const params: Record<string, string> = {};
  for (const part of match[1].split('&')) {
    const [k, v = ''] = part.split('=');
    try {
      params[k] = decodeURIComponent(v);
    } catch {
      return null;
    }
  }
  const host = (params.h ?? '').toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) || !isPrivate(host)) {
    return null;
  }
  const port = params.p ? Number(params.p) : STATUS_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const code = cleanCode(params.c ?? '');
  if (code == null) return null;
  return { address: { host, port }, code };
}

export interface Paired {
  deviceId: string;
  key: string;
}

/** Trades the code from the Umbrel page for this phone's own key. */
export async function pairWith(
  address: Address,
  code: string,
  name: string,
  timeoutMs = 8000,
): Promise<Paired> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`http://${addressLabel(address)}/phone/pair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ code, name }),
      signal: controller.signal,
    });
  } catch {
    throw new RockError(
      `No answer from ${addressLabel(
        address,
      )}. Is the phone on the same Wi-Fi as your Umbrel?`,
      'unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // An Umbrel login page is HTML, not JSON.
  }
  if (
    response.ok &&
    typeof body?.id === 'string' &&
    typeof body?.key === 'string'
  ) {
    return { deviceId: body.id, key: body.key };
  }
  switch (body?.error) {
    case 'code':
    case 'expired':
      throw new RockError(
        'That code is wrong or has expired. Check it on your Umbrel, or tap New code there.',
        'code',
      );
    case 'tries':
      throw new RockError(
        'Too many wrong tries. Tap New code on your Umbrel and try again.',
        'code',
      );
    case 'full':
      throw new RockError(
        'Your Rock already has ten iPhones. Remove one on the Umbrel page first.',
        'code',
      );
  }
  throw new RockError(
    'Your Umbrel asked for a login. Update Zecky Rock it on the Umbrel to version 0.2.0 or newer.',
    'login',
  );
}
