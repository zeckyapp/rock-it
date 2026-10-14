import { Address } from './address';
import { Rock } from './rock';
import { fetchStatus, RockError, RockStatus } from './status';

export interface Reached {
  status: RockStatus;
  via: 'home' | 'away';
  address: Address;
}

/**
 * Asks the Rock for its status: the home address first (fast, and it works
 * on the home Wi-Fi), then the Tailscale address. The error from the last
 * try is the one shown, unless an earlier one says more.
 */
export async function checkRock(
  rock: Rock,
  fetcher: typeof fetchStatus = fetchStatus,
): Promise<Reached> {
  const tries: { via: Reached['via']; address: Address }[] = [];
  if (rock.home) tries.push({ via: 'home', address: rock.home });
  if (rock.away) tries.push({ via: 'away', address: rock.away });
  let best: RockError | null = null;
  for (const t of tries) {
    try {
      return { ...t, status: await fetcher(t.address) };
    } catch (e) {
      const err =
        e instanceof RockError ? e : new RockError(String(e), 'unreachable');
      if (best == null || best.kind === 'unreachable') best = err;
    }
  }
  throw best ?? new RockError('This Rock has no address yet.', 'unreachable');
}
