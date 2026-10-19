import {
  isPrivate,
  isTailscale,
  parseAddress,
  shortLabel,
} from '../src/lib/address';
import { checkRock } from '../src/lib/check';
import { parseRock } from '../src/lib/rock';
import { cleanCode, pairWith, parsePairLink } from '../src/lib/pair';
import {
  fetchStatus,
  parseOtherWallets,
  parseStatus,
  RockError,
  summarize,
  tiles,
} from '../src/lib/status';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Settings: { get: () => undefined, set: () => {} },
}));
jest.mock('react-native-keychain', () => ({}));
const PIN = 'We6e8QC7FrbhTr9vp9oaP9bpNU9LNu9Erqxzb3NSxa8';
const mockCalls: { url: string; options: Record<string, unknown> }[] = [];
let mockAnswer: (
  url: string,
  options: Record<string, unknown>,
) => Promise<{ status: number; body: string; pin: string }>;
jest.mock('rockit-tls', () => ({
  pinnedRequest: (url: string, options: Record<string, unknown>) => {
    mockCalls.push({ url, options });
    return mockAnswer(url, options);
  },
}));
function reply(status: number, body: unknown, pin = PIN) {
  return Promise.resolve({ status, body: JSON.stringify(body), pin });
}
beforeEach(() => {
  mockCalls.length = 0;
});

const ready = {
  phase: 'ready',
  node: {
    reachable: true,
    chain: 'main',
    height: 3520104,
    estimatedHeight: 3520104,
    progress: 1,
    peers: 8,
    pools: { shieldedZat: 496315466000000, totalZat: 1500000000000000 },
  },
  walletServer: { open: true, port: 8137 },
  disk: { free: 1.62e12, total: 2e12 },
  privacy: { inbound: false },
  version: '0.1.1',
};

describe('addresses', () => {
  it('reads what people type', () => {
    expect(parseAddress('192.168.1.20')).toEqual({
      host: '192.168.1.20',
      port: 8139,
    });
    expect(parseAddress(' http://Umbrel.local:8138/ ')).toEqual({
      host: 'umbrel.local',
      port: 8139,
    });
    expect(parseAddress('192.168.1.8:8137')).toEqual({
      host: '192.168.1.8',
      port: 8139,
    });
    expect(parseAddress('192.168.1.20:99999')).toBeNull();
    expect(parseAddress('not an address')).toBeNull();
  });

  it('shows the address without the usual port', () => {
    expect(shortLabel({ host: '192.168.1.8', port: 8139 })).toBe('192.168.1.8');
    expect(shortLabel({ host: '192.168.1.8', port: 9000 })).toBe(
      '192.168.1.8:9000',
    );
  });

  it('knows home and Tailscale ranges', () => {
    expect(isTailscale('100.101.102.103')).toBe(true);
    expect(isTailscale('100.20.1.1')).toBe(false);
    expect(isTailscale('umbrel.tail1234.ts.net')).toBe(true);
    expect(isPrivate('192.168.1.20')).toBe(true);
    expect(isPrivate('172.20.0.1')).toBe(true);
    expect(isPrivate('8.8.8.8')).toBe(false);
  });
});

describe('status', () => {
  it('accepts a real reply and rejects others', () => {
    expect(parseStatus(ready)?.node.height).toBe(3520104);
    expect(parseStatus({ phase: 'party' })).toBeNull();
    expect(parseStatus('<html>')).toBeNull();
  });

  it('says it plainly', () => {
    expect(summarize(parseStatus(ready)!)).toMatchObject({
      headline: 'Synced',
      detail: 'Block 3,520,104 · checked by you',
      tone: 'ok',
    });
    const syncing = parseStatus({
      ...ready,
      phase: 'syncing',
      node: { ...ready.node, height: 1480000, progress: 0.42099 },
    })!;
    expect(summarize(syncing)).toMatchObject({
      headline: '42.0%',
      detail: 'Syncing · block 1,480,000 of 3,520,104',
    });
  });
});

describe('the one address for every wallet', () => {
  const ts = {
    name: 'rockit.tail1234.ts.net',
    address: 'https://rockit.tail1234.ts.net:9067',
  };

  it('shows it only when Connect is on', () => {
    expect(parseStatus(ready)!.otherWallets).toBeNull();
    expect(parseStatus({ ...ready, otherWallets: ts })!.otherWallets).toEqual(ts);
  });

  it('takes the wallet port from the Rock', () => {
    const s = parseStatus({ ...ready, walletServer: { open: true, port: 18137 } })!;
    expect(s.walletServer.port).toBe(18137);
  });

  it('accepts nothing but https on the same ts.net name', () => {
    const bad = [
      { ...ts, address: 'http://rockit.tail1234.ts.net:9067' },
      { ...ts, address: 'https://evil.example.com:9067' },
      { ...ts, address: 'https://rockit.tail1234.ts.net.evil.com:9067' },
      { ...ts, address: 'https://other.tail1234.ts.net:9067' },
      { ...ts, address: 'https://rockit.tail1234.ts.net:9067/path' },
      { ...ts, address: 'https://rockit.tail1234.ts.net' },
      { ...ts, address: 'https://rockit.tail1234.ts.net:99999' },
      { name: 'example.com', address: 'https://example.com:9067' },
      { name: 42, address: ts.address },
      'https://rockit.tail1234.ts.net:9067',
      null,
    ];
    for (const b of bad) expect(parseOtherWallets(b)).toBeNull();
    expect(parseOtherWallets(ts)).toEqual(ts);
  });
});

describe('tiles', () => {
  it('shows the four tiles with the Umbrel words', () => {
    expect(tiles(parseStatus(ready)!)).toEqual([
      { title: 'Shielded', text: '33%', subtext: 'of ZEC' },
      { title: 'Network', text: '8', subtext: 'peers' },
      { title: 'Wallets', text: 'Ready', subtext: '' },
      { title: 'Mode', text: 'Private', subtext: 'node' },
    ]);
  });

  it('shows a dash when the node is not there yet', () => {
    const t = tiles(
      parseStatus({
        phase: 'starting',
        node: { reachable: false },
        walletServer: { open: false, port: 8137 },
        disk: null,
        privacy: { inbound: true },
        version: '0.3.9',
      })!,
    );
    // Never 'Supporter', even if an older Rock reports inbound.
    expect(t.map(x => x.text)).toEqual(['–', '–', 'Not ready', 'Private']);
    expect(t[0].subtext).toBe('of ZEC');
  });
});

describe('a Rock', () => {
  it('needs at least one address', () => {
    expect(parseRock(JSON.stringify({ name: 'x' }))).toBeNull();
    expect(
      parseRock(JSON.stringify({ name: '', home: '192.168.1.20' })),
    ).toEqual({
      name: 'My Rock',
      home: { host: '192.168.1.20', port: 8139 },
      away: null,
      deviceId: null,
      pin: null,
    });
    expect(
      parseRock(JSON.stringify({ home: 'umbrel.local', deviceId: 'ab12' }))
        ?.deviceId,
    ).toBe('ab12');
  });

  it('tries home first, then Tailscale', async () => {
    const rock = parseRock(
      JSON.stringify({
        name: 'Rock',
        home: '192.168.1.20',
        away: '100.101.102.103',
      }),
    )!;
    const seen: string[] = [];
    const reached = await checkRock(rock, 'k', async a => {
      seen.push(a.host);
      if (a.host === '192.168.1.20') {
        throw new RockError('No mockAnswer', 'unreachable');
      }
      return parseStatus(ready)!;
    });
    expect(seen).toEqual(['192.168.1.20', '100.101.102.103']);
    expect(reached.via).toBe('away');
  });

  it('keeps the error that says the most', async () => {
    const rock = parseRock(
      JSON.stringify({ home: '192.168.1.20', away: '100.101.102.103' }),
    )!;
    await expect(
      checkRock(rock, 'k', async a => {
        throw a.host === '192.168.1.20'
          ? new RockError('Login', 'login')
          : new RockError('No mockAnswer', 'unreachable');
      }),
    ).rejects.toMatchObject({ kind: 'login' });
  });
});

describe('pairing', () => {
  it('reads codes the way people type them', () => {
    expect(cleanCode('k7qm-3xpa')).toBe('K7QM3XPA');
    expect(cleanCode(' K7QM 3XPA ')).toBe('K7QM3XPA');
    expect(cleanCode('K7QM3XP')).toBeNull();
    expect(cleanCode('K7QM3XP0')).toBeNull(); // no zero in codes
  });

  it('reads the QR link, only for private addresses', () => {
    expect(
      parsePairLink(`rockit://pair?h=umbrel.local&c=K7QM3XPA&t=8139&k=${PIN}`),
    ).toEqual({
      address: { host: 'umbrel.local', port: 8139 },
      code: 'K7QM3XPA',
      pin: PIN,
    });
    expect(
      parsePairLink('rockit://pair?h=100.101.102.103&c=K7QM3XPA')?.address,
    ).toEqual({ host: '100.101.102.103', port: 8139 });
    expect(
      parsePairLink('rockit://pair?h=evil.example.com&c=K7QM3XPA'),
    ).toBeNull();
    expect(parsePairLink('rockit://pair?h=8.8.8.8&c=K7QM3XPA')).toBeNull();
    expect(parsePairLink('rockit://pair?h=umbrel.local&c=nope')).toBeNull();
    expect(
      parsePairLink('rockit://pair?h=umbrel.local&c=K7QM3XPA&k=short'),
    ).toBeNull();
    expect(parsePairLink('https://umbrel.local/?c=K7QM3XPA')).toBeNull();
  });

  it('pairs over HTTPS, trusting only the QR fingerprint', async () => {
    mockAnswer = () => reply(200, { id: 'd1', key: 'secret' });
    const paired = await pairWith(
      { host: 'umbrel.local', port: 8139 },
      'K7QM3XPA',
      'iPhone',
      PIN,
    );
    expect(paired).toEqual({ deviceId: 'd1', key: 'secret', pin: PIN });
    expect(mockCalls).toHaveLength(1);
    expect(mockCalls[0].url).toBe('https://umbrel.local:8139/phone/pair');
    expect(mockCalls[0].options.pin).toBe(PIN);
    expect(JSON.parse(String(mockCalls[0].options.body))).toEqual({
      code: 'K7QM3XPA',
      name: 'iPhone',
    });
  });

  it('with a typed code, learns the fingerprint once and keeps it', async () => {
    mockAnswer = url =>
      url.endsWith('/phone/hello')
        ? reply(200, { rockit: true })
        : reply(200, { id: 'd1', key: 'secret' });
    const paired = await pairWith(
      { host: 'umbrel.local', port: 8139 },
      'K7QM3XPA',
      'iPhone',
      null,
    );
    expect(mockCalls.map(c => c.options.pin)).toEqual(['', PIN]);
    expect(paired.pin).toBe(PIN);
  });

  it('explains a wrong code, a stranger and a different Rock', async () => {
    const at = { host: 'umbrel.local', port: 8139 };
    mockAnswer = () => reply(403, { error: 'code' });
    await expect(pairWith(at, 'K7QM3XPA', 'x', PIN)).rejects.toMatchObject({
      kind: 'code',
    });
    mockAnswer = () => reply(200, { hello: 'world' });
    await expect(pairWith(at, 'K7QM3XPA', 'x', null)).rejects.toMatchObject({
      kind: 'notRockIt',
    });
    mockAnswer = () =>
      Promise.reject(Object.assign(new Error('x'), { code: 'pin' }));
    await expect(pairWith(at, 'K7QM3XPA', 'x', PIN)).rejects.toMatchObject({
      kind: 'pin',
    });
  });

  it('sends the key and notices when the iPhone was removed', async () => {
    const at = { host: 'umbrel.local', port: 8139 };
    mockAnswer = () =>
      reply(200, { ...ready, privacy: { mode: 'private', inbound: false } });
    const status = await fetchStatus(at, 'secret', PIN);
    expect(mockCalls[0].url).toBe('https://umbrel.local:8139/phone/status');
    expect(mockCalls[0].options.pin).toBe(PIN);
    expect(
      (mockCalls[0].options.headers as Record<string, string>).Authorization,
    ).toBe('Bearer secret');
    expect(status.privacy).toEqual({ inbound: false });

    mockAnswer = () => reply(401, { error: 'unpaired' });
    await expect(fetchStatus(at, 'old', PIN)).rejects.toMatchObject({
      kind: 'unpaired',
    });
  });

  it('asks to pair again when the Rock has no fingerprint yet', async () => {
    await expect(
      fetchStatus({ host: 'umbrel.local', port: 8139 }, 'k', ''),
    ).rejects.toMatchObject({ kind: 'unpaired' });
    expect(mockCalls).toHaveLength(0);
  });

  it('stops at "not paired" instead of trying the next address', async () => {
    const rock = parseRock(
      JSON.stringify({ home: '192.168.1.20', away: '100.101.102.103' }),
    )!;
    const seen: string[] = [];
    await expect(
      checkRock(rock, 'k', async a => {
        seen.push(a.host);
        throw new RockError('Removed', 'unpaired');
      }),
    ).rejects.toMatchObject({ kind: 'unpaired' });
    expect(seen).toEqual(['192.168.1.20']);
  });
});
