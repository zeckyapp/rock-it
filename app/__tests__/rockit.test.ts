import { isPrivate, isTailscale, parseAddress } from '../src/lib/address';
import { checkRock } from '../src/lib/check';
import { parseRock } from '../src/lib/rock';
import { cleanCode, pairWith, parsePairLink } from '../src/lib/pair';
import {
  fetchStatus,
  parseStatus,
  RockError,
  summarize,
} from '../src/lib/status';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Settings: { get: () => undefined, set: () => {} },
}));
jest.mock('react-native-keychain', () => ({}));

function reply(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    json: () =>
      typeof body === 'string'
        ? Promise.reject(new Error('html'))
        : Promise.resolve(body),
  } as unknown as Response);
}

const ready = {
  phase: 'ready',
  node: {
    reachable: true,
    chain: 'main',
    height: 3520104,
    estimatedHeight: 3520104,
    progress: 1,
    peers: 8,
  },
  walletServer: { open: true, port: 8137 },
  disk: { free: 1.62e12, total: 2e12 },
  version: '0.1.1',
};

describe('addresses', () => {
  it('reads what people type', () => {
    expect(parseAddress('192.168.1.20')).toEqual({
      host: '192.168.1.20',
      port: 8138,
    });
    expect(parseAddress(' http://Umbrel.local:8138/ ')).toEqual({
      host: 'umbrel.local',
      port: 8138,
    });
    expect(parseAddress('192.168.1.20:99999')).toBeNull();
    expect(parseAddress('not an address')).toBeNull();
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
      headline: 'Live',
      detail: 'Block 3,520,104',
      tone: 'ok',
    });
    const syncing = parseStatus({
      ...ready,
      phase: 'syncing',
      node: { ...ready.node, height: 1480000, progress: 0.42099 },
    })!;
    expect(summarize(syncing)).toMatchObject({
      headline: 'Syncing 42.0%',
      detail: 'Block 1,480,000 of about 3,520,104',
    });
  });
});

describe('a Rock', () => {
  it('needs at least one address', () => {
    expect(parseRock(JSON.stringify({ name: 'x' }))).toBeNull();
    expect(
      parseRock(JSON.stringify({ name: '', home: '192.168.1.20' })),
    ).toEqual({
      name: 'My Rock',
      home: { host: '192.168.1.20', port: 8138 },
      away: null,
      deviceId: null,
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
        throw new RockError('No answer', 'unreachable');
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
          : new RockError('No answer', 'unreachable');
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
      parsePairLink('rockit://pair?h=umbrel.local&p=8138&c=K7QM3XPA'),
    ).toEqual({
      address: { host: 'umbrel.local', port: 8138 },
      code: 'K7QM3XPA',
    });
    expect(
      parsePairLink('rockit://pair?h=100.101.102.103&p=8138&c=K7QM3XPA')
        ?.address.host,
    ).toBe('100.101.102.103');
    expect(
      parsePairLink('rockit://pair?h=evil.example.com&c=K7QM3XPA'),
    ).toBeNull();
    expect(parsePairLink('rockit://pair?h=8.8.8.8&c=K7QM3XPA')).toBeNull();
    expect(parsePairLink('rockit://pair?h=umbrel.local&c=nope')).toBeNull();
    expect(parsePairLink('https://umbrel.local/?c=K7QM3XPA')).toBeNull();
  });

  it('trades the code for a key', async () => {
    const calls: [string, RequestInit][] = [];
    globalThis.fetch = jest.fn((url: string, init: RequestInit) => {
      calls.push([url, init]);
      return reply(200, { id: 'd1', key: 'secret' });
    }) as unknown as typeof fetch;
    const paired = await pairWith(
      { host: 'umbrel.local', port: 8138 },
      'K7QM3XPA',
      'iPhone',
    );
    expect(paired).toEqual({ deviceId: 'd1', key: 'secret' });
    expect(calls[0][0]).toBe('http://umbrel.local:8138/phone/pair');
    expect(JSON.parse(String(calls[0][1].body))).toEqual({
      code: 'K7QM3XPA',
      name: 'iPhone',
    });
  });

  it('explains a wrong code and an old Rock', async () => {
    const at = { host: 'umbrel.local', port: 8138 };
    globalThis.fetch = jest.fn(() => reply(403, { error: 'code' })) as never;
    await expect(pairWith(at, 'K7QM3XPA', 'x')).rejects.toMatchObject({
      kind: 'code',
    });
    globalThis.fetch = jest.fn(() => reply(200, '<html>')) as never;
    await expect(pairWith(at, 'K7QM3XPA', 'x')).rejects.toMatchObject({
      kind: 'login',
    });
  });

  it('sends the key and notices when the iPhone was removed', async () => {
    const at = { host: 'umbrel.local', port: 8138 };
    let headers: Record<string, string> = {};
    globalThis.fetch = jest.fn((url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      expect(url).toBe('http://umbrel.local:8138/phone/status');
      return reply(200, {
        ...ready,
        privacy: { mode: 'private', inbound: false },
      });
    }) as never;
    const status = await fetchStatus(at, 'secret');
    expect(headers.Authorization).toBe('Bearer secret');
    expect(status.privacy).toEqual({ inbound: false });

    globalThis.fetch = jest.fn(() =>
      reply(401, { error: 'unpaired' }),
    ) as never;
    await expect(fetchStatus(at, 'old')).rejects.toMatchObject({
      kind: 'unpaired',
    });
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
