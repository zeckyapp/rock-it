import {
  Address,
  addressLabel,
  isPrivate,
  isTailscale,
  PHONE_PORT,
} from './address';
import { rockRequest } from './https';
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
  /** The Rock's certificate fingerprint (base64url SHA-256), from the QR. */
  pin: string | null;
  /**
   * The home address too, when the QR carries the Tailscale name (`l=`, from
   * Rock it on Umbrel that sends it), so pairing also works at home with
   * Tailscale off.
   */
  home?: Address;
}

/** A certificate fingerprint: 32 bytes as base64url, 43 characters. */
const PIN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Reads the link in the Umbrel page's QR code:
 *   rockit://pair?h=umbrel.local&c=ABCDEFGH&t=8139&k=<fingerprint>
 * or, with Connect on, h=<Tailscale name> and l=<home address>.
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
  const port = params.t ? Number(params.t) : PHONE_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const code = cleanCode(params.c ?? '');
  if (code == null) return null;
  if (params.k != null && !PIN.test(params.k)) return null;
  const l = (params.l ?? '').toLowerCase();
  let home: Address | undefined;
  if (l) {
    // Only a home address: never the internet, never a second Tailscale one.
    if (
      !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(l) ||
      !isPrivate(l) ||
      isTailscale(l)
    ) {
      return null;
    }
    home = { host: l, port };
  }
  return {
    address: { host, port },
    code,
    pin: params.k ?? null,
    ...(home ? { home } : {}),
  };
}

export interface Paired {
  deviceId: string;
  key: string;
  /** The fingerprint of the Rock's certificate, kept from now on. */
  pin: string;
}

/**
 * Trades the code from the Umbrel page for this phone's own key, over HTTPS.
 * With the fingerprint from the QR, only that Rock is trusted. Without it
 * (a typed code), the Rock that answers is trusted and its fingerprint is kept
 * for every later connection.
 */
export async function pairWith(
  address: Address,
  code: string,
  name: string,
  pin: string | null,
): Promise<Paired> {
  let trusted = pin;
  if (trusted == null) {
    const hello = await rockRequest(address, '/phone/hello', { pin: '' });
    if (hello.json?.rockit !== true || !PIN.test(hello.pin)) {
      throw new RockError(
        `${addressLabel(
          address,
        )} answered, but it is not Rock it 0.3.0 or newer.`,
        'notRockIt',
      );
    }
    trusted = hello.pin;
  }
  const reply = await rockRequest(address, '/phone/pair', {
    pin: trusted,
    method: 'POST',
    body: { code, name },
  });
  const body = reply.json;
  if (
    reply.status === 200 &&
    typeof body?.id === 'string' &&
    typeof body?.key === 'string'
  ) {
    return { deviceId: body.id, key: body.key, pin: trusted };
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
        'Too many wrong tries. Your Umbrel shows a new code by itself: use that one.',
        'code',
      );
    case 'full':
      throw new RockError(
        'Your Rock already has ten iPhones. Remove one on the Umbrel page first.',
        'code',
      );
  }
  throw new RockError(
    `${addressLabel(address)} answered, but it is not Rock it 0.3.0 or newer.`,
    'notRockIt',
  );
}

/**
 * Pairs through the first address that answers: home first (it works with
 * Tailscale off), then Tailscale. Only "no answer" moves on to the next
 * address; a wrong code stops at once, so it never costs a second try.
 */
export async function pairFirst(
  targets: Address[],
  code: string,
  name: string,
  pin: string | null,
  pair: typeof pairWith = pairWith,
): Promise<{ paired: Paired; via: Address }> {
  let last: unknown = new RockError(
    'Enter at least one address.',
    'unreachable',
  );
  for (const target of targets) {
    try {
      return { paired: await pair(target, code, name, pin), via: target };
    } catch (e) {
      if (!(e instanceof RockError) || e.kind !== 'unreachable') throw e;
      last = e;
    }
  }
  throw last;
}

/** Whether the Rock answers on this address, with its pinned certificate. */
export async function answers(
  address: Address,
  pin: string,
  timeoutMs = 4000,
): Promise<boolean> {
  try {
    const r = await rockRequest(address, '/phone/hello', { pin, timeoutMs });
    return r.json?.rockit === true;
  } catch {
    return false;
  }
}
