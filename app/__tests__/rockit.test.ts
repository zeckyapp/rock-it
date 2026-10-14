import { isPrivate, isTailscale, parseAddress } from '../src/lib/address';
import { checkRock } from '../src/lib/check';
import { parseRock } from '../src/lib/rock';
import { parseStatus, RockError, summarize } from '../src/lib/status';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Settings: { get: () => undefined, set: () => {} },
}));

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
    });
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
    const reached = await checkRock(rock, async a => {
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
      checkRock(rock, async a => {
        throw a.host === '192.168.1.20'
          ? new RockError('Login', 'login')
          : new RockError('No answer', 'unreachable');
      }),
    ).rejects.toMatchObject({ kind: 'login' });
  });
});
