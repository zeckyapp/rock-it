# Findings: Rock it on a Raspberry Pi 5

Raspberry Pi 5, 8 GB, 2 TB SSD, umbrelOS. October 2026.

## Node: Zakura instead of Zebra

- Zakura 1.6.0 has an arm64 image (`zakuracore/zakura`) and runs on the Pi.
- Its archive snapshot (about 255 GB, block 3,514,799) downloaded in about
  six hours at 12 to 15 MB/s and unpacked to 262 GB in `state/v29`, which
  matches Zakura 1.6.0's database version. Zakura then caught up the last day
  of blocks in minutes. A full sync from scratch takes days.
- The pruned snapshot (11 GB) keeps only the last 10,000 blocks: too few for
  wallets that scan from an older birthday.
- Inside the container the data folder is `/home/zebra/.cache/zakura`, not
  `/home/zakura/...` as the website says.
- RPC is off by default. `ZAKURA_RPC__LISTEN_ADDR` turns it on;
  `ZAKURA_RPC__ENABLE_COOKIE_AUTH=false` serves the restricted method set
  without a password, which is enough for Zaino.
- Zaino 0.10.2 works with Zakura 1.6.0 over RPC (`backend = "rpc"`), although
  Zakura is not part of the tested Z3 stack (Zebra, Zaino, Zallet).

## Zaino on the Pi

- No arm64 image is published (only amd64), so it is built on the Pi.
- It needs `ca-certificates` in the image: its RPC client loads the system
  root certificates on start ("http error: builder error" without them).
- `grpc_settings.listen_address` must be an IP address, and a private one
  unless TLS is set up. Hence a fixed address on a Docker network with a set
  subnet.
- `storage.database.size = 384` (the default, in GB) cannot be mapped on the
  Pi ("Cannot allocate memory"). 200 works.
- Building its own index from Zakura runs at about 17 blocks per second: two
  to three days for the whole chain. Until it is done, the wallet port stays
  closed.
- With `ephemeral_finalised_state = true` it keeps no index and is ready in
  about a minute, reading everything from Zakura.

## Why the patches

Measured with Zakura on the same Pi:

| Call | While Zaino indexed | Idle |
| --- | --- | --- |
| `getblock` (verbosity 1) | 1.1 s | |
| `z_gettreestate` | 0.57 s | 0.0045 s |
| `getblockhash` | 0.47 s | 0.008 s |

The wallet asks for 1,128 Sapling subtree roots at start. Stock Zaino looks up
one block per root, which runs far past the wallet's 30-second limit. In
ephemeral mode even its "does this block exist" check downloads the full
block. See the patches in `zaino/patches/`.

Measured again in October 2026 on the same Pi, per subtree root (1,128 Sapling
roots):

| Call | Each | All roots |
| --- | --- | --- |
| `getblock` (verbosity 1, stock Zaino) | about 1.1 s | about 20 min |
| `z_gettreestate` at the end height | about 2.6 s | about 47 min |
| `getblockhash` at the end height | about 3 ms | 3.3 s |

Rock it's patch leaves the completing block hash empty, which wallets on the
ECC SDK do not use. Zaino has no `getblockhash` call yet; with one, the full
answer (hash included) is fast too. Reported upstream so it can be fixed for
everyone and the patches dropped: zingolabs/zaino#1665 (subtree roots, with
these measurements) and zingolabs/zaino#1673 (tree state by height).

## Wallets

- react-native-zcash 0.13.5 always connects with TLS. Lock it and Pocket patch
  it to skip TLS for private addresses only: the home network (10/8,
  172.16/12, 192.168/16), the phone itself (127/8) and Tailscale (100.64/10).
- iOS needs `NSLocalNetworkUsageDescription` before an app may reach the home
  network.
- Tailscale on the Pi (Umbrel app) and on the phone gives a working connection
  from anywhere, with no router changes.

## Umbrel: other apps

- Every Umbrel app joins the shared `umbrel_main_network` (10.21.0.0/16).
  Up to 0.3.4 Rock it sat there too, so any other app could read the pairing
  code, remove iPhones and call the node's RPC, which has no password.
  Checked from a throwaway container on that network.
- On this umbrelOS the login proxy is Umbrel's own process on the host, not
  an `app_proxy` container. It reaches the page from the host's address on
  the network (10.21.0.1).
- From 0.3.5 the node and Zaino are on Rock it's own network (10.137.42.0/24),
  and the status page answers only the host's addresses (`PAGE_CLIENTS`).
- The status container must be on exactly one network. Umbrel finds a
  widget's address with `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`,
  which glues all addresses together; with two networks the widget stayed
  empty ("ENOTFOUND status"). From 0.3.6 status is only on Rock it's own
  network, which the host (and so the login proxy and widget) still reaches.
- Apps on the host network (Tailscale) count as the host and are not shut
  out. They already have full access to the Umbrel.

## Zakura releases expire

- Every Zakura release stops itself at a set block height, with warnings
  about three days before. 1.6.0 stopped after block 3,536,467 (around
  1 November 2026); 1.7.0 runs to block 3,640,098 (around 4 December 2026)
  and follows NU7 at block 3,543,405. Rock it must ship each new Zakura well
  before the old one expires.
- 1.7.0 moves the state database from format v29 to v30 but reuses the
  existing data in place: no new sync.
- Zaino 0.10.2 does not know NU7 yet. It still starts (it skips upgrades it
  does not recognise), but wallets through Rock it must be retested after
  NU7 activates.

## What the node tells about the network (checked 25 October 2026)

- Zakura does not report its end-of-support (stop) height over RPC. It only
  starts a background check at launch and logs a warning near the end. Rock
  it has to carry the stop height for each pinned Zakura release itself.
- `getnetworksolps` works and gives the network hashrate in sol/s (about
  30 GS/s at the time).
- `getpeerinfo` gives `addr`, `inbound`, `pingtime`, `subver` and `version`
  per peer. The addresses must never leave the Rock; the rest can be shown as
  counts.
- In Private mode the node had about 150 outgoing peers and none incoming.
  Private means nobody can connect in and the node is not announced; the
  peers it connects out to do see the home IP.
- The protocol version does not tell whether a peer is ready for the next
  upgrade: Zakura 1.5.1 and 1.6.0 report 170190 like 1.7.0, but 1.6.0 stops
  before NU7. Readiness has to come from software and version (for NU7:
  Zebra 7 or newer, Zakura 1.7 or newer).
- Seen at the time: Zakura 1.x 60, Zebra 6.x 49, Zebra 7.x 40, other 1.
- Port 8233 (the Zcash peer port) is the web port of Linkwarden, an official
  Umbrel app. Publishing 8233 on the Umbrel would stop Rock it from starting
  next to it, so a Supporter mode needs another public port.
