import { useSyncExternalStore } from 'react';
import { Platform, Settings } from 'react-native';
import { Address, addressLabel, parseAddress } from './address';

/**
 * The owner's Rock: one address at home, one for when they are away, and
 * this phone's device id from pairing (the key itself is in the Keychain).
 * A Rock saved by 0.1 has no device id and must be paired.
 */
export interface Rock {
  name: string;
  home: Address | null;
  away: Address | null;
  deviceId: string | null;
}

const KEY = 'rockit.rock';
export const MAX_NAME = 32;

export function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME);
  return trimmed.length > 0 ? trimmed : 'My Rock';
}

/** Reads a stored Rock, or null when there is none or it is malformed. */
export function parseRock(raw: unknown): Rock | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value == null || typeof value !== 'object') return null;
  const v = value as {
    name?: unknown;
    home?: unknown;
    away?: unknown;
    deviceId?: unknown;
  };
  const home = typeof v.home === 'string' ? parseAddress(v.home) : null;
  const away = typeof v.away === 'string' ? parseAddress(v.away) : null;
  if (home == null && away == null) return null;
  return {
    name: cleanName(typeof v.name === 'string' ? v.name : ''),
    home,
    away,
    deviceId: typeof v.deviceId === 'string' ? v.deviceId : null,
  };
}

function load(): Rock | null {
  try {
    if (Platform.OS === 'ios') return parseRock(Settings.get(KEY));
  } catch {
    // Treated as no Rock yet.
  }
  return null;
}

let current: Rock | null | undefined;
const listeners = new Set<() => void>();

export function getRock(): Rock | null {
  if (current === undefined) current = load();
  return current;
}

export function saveRock(rock: Rock | null): void {
  current = rock;
  try {
    if (Platform.OS === 'ios') {
      Settings.set({
        [KEY]:
          rock == null
            ? ''
            : JSON.stringify({
                name: rock.name,
                home: rock.home && addressLabel(rock.home),
                away: rock.away && addressLabel(rock.away),
                deviceId: rock.deviceId,
              }),
      });
    }
  } catch {
    // Kept until the app is closed.
  }
  listeners.forEach(listener => listener());
}

export function useRock(): Rock | null {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getRock);
}
