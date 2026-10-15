import * as Keychain from 'react-native-keychain';

/**
 * This iPhone's key for the Rock, from pairing. Kept in the iOS Keychain,
 * readable only while the phone is unlocked and never copied to another
 * device or a backup.
 */
const SERVICE = 'app.zecky.rockit.key';

let cached: string | null | undefined;

export async function loadKey(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const found = await Keychain.getGenericPassword({ service: SERVICE });
    cached = found ? found.password : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Saves the key with its device id (shown on the Umbrel page). */
export async function saveKey(deviceId: string, key: string): Promise<void> {
  await Keychain.setGenericPassword(deviceId, key, {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  cached = key;
}

export async function clearKey(): Promise<void> {
  cached = null;
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // Nothing stored.
  }
}
