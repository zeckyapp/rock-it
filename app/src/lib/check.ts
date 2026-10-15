import { Address } from './address';
import { Rock } from './rock';
import { fetchStatus, RockError, RockStatus } from './status';

export interface Reached {
  status: RockStatus;
  via: 'home' | 'away';
  address: Address;
}

/**
 * Asks the Rock for its status with this phone's key: the home address first
 * (fast, and it works on the home Wi-Fi), then the Tailscale address. The
 * error from the last try is the one shown, unless an earlier one says more.
 * When the Rock says this phone is not paired, that is the answer.
 */
export async function checkRock(
  rock: Rock,
  key: string,
  fetcher: typeof fetchStatus = fetchStatus,
): Promise<Reached> {
  const tries: { via: Reached['via']; address: Address }[] = [];
  if (rock.home) tries.push({ via: 'home', address: rock.home });
  if (rock.away) tries.push({ via: 'away', address: rock.away });
  let best: RockError | null = null;
  for (const t of tries) {
    try {
      return { ...t, status: await fetcher(t.address, key, rock.pin ?? '') };
    } catch (e) {
      const err =
        e instanceof RockError ? e : new RockError(String(e), 'unreachable');
      if (err.kind === 'unpaired') throw err;
      if (best == null || best.kind === 'unreachable') best = err;
    }
  }
  throw best ?? new RockError('This Rock has no address yet.', 'unreachable');
}
