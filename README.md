# Zecky Rock it

Your own Zcash node at home, for Zecky Lock it and Zecky Flip it.

Rock it runs two programs side by side:

- **Zakura**, a Zcash full node (a faster fork of the Zcash Foundation's
  Zebra). It keeps the chain.
- **Zaino** (by ZingoLabs), a light-wallet server. It answers the wallets'
  questions by asking Zakura.

```
Lock it / Flip it --8137-->  Zaino  --RPC 8232-->  Zakura  --8233-->  Zcash network
                             (rockitnet, a private Docker network)
```

The wallets keep their keys. Rock it holds no keys and no funds.

## Layout

| Path | What |
| --- | --- |
| `umbrel-app-store.yml`, `zecky-rock-it/` | The Umbrel app (a community app store) |
| `status/` | The status and connection page the Umbrel app opens to |
| `zaino/Dockerfile` | Builds Zaino 0.10.2 with the Rock it patches |
| `zaino/patches/` | The Rock it changes to Zaino |
| `zaino/zainod.toml` | Zaino's settings in the image (Umbrel writes its own from `zecky-rock-it/zainod.toml.template`) |
| `scripts/rockit-status.sh` | Sync status and the Pi's health, run on the Umbrel |
| `docs/findings.md` | What was learned getting this to run on a Raspberry Pi 5 |
| `app/` | The Rock it iPhone app (see `app/README.md`) |

## Running it

Rock it runs as an Umbrel app (below). The pinned images and settings in
`zecky-rock-it/` are the only supported way to run it; the older stand-alone
`compose.yml` is gone. To check on it from the Umbrel's Terminal:

```
sudo sh scripts/rockit-status.sh
```

In Lock it or Flip it: Settings, Network, Add a server. Use the private
address the page shows (Settings, Private address), or at home the Umbrel's
address, for example `192.168.1.20:8137`.

## On Umbrel

This repository is also an Umbrel community app store. In umbrelOS: App
Store, the three dots, Community App Stores, add
`https://github.com/zeckyapp/rock-it`, then install Zecky Rock it.

The app runs Zakura, Zaino and a small status page (`status/`). The page shows
the sync, the address to enter in Zecky and a QR code to pair the Rock it
iPhone app, and adds a sync widget to the Umbrel home screen. Wallets connect
on port 8137; the node's RPC stays inside Docker. The node's peer port (8233)
is not published, so it only connects out and nobody can find it from the
internet.

Pairing: the page (behind the Umbrel login) shows a code that works once, for
ten minutes. One sender gets five wrong tries in ten minutes, each answered
after a short wait; after twenty wrong tries in all the code dies. The iPhone trades it at
`/phone/pair` for its own key, and `/phone/status` answers only with a paired
key. The iPhone app only talks to the Rock over HTTPS on port 8139, with a
certificate the Rock makes on first start. The QR carries its SHA-256
fingerprint, and from then on the app trusts nothing else. Scanning the QR is
the safe way to pair: a code typed by hand trusts the certificate it sees the
first time, so on a network you do not trust, use the QR. Port 8138 (the page) stays
behind the Umbrel login, and that HTTPS port answers nothing but `/phone/*`. Keys are stored as SHA-256
hashes in the app's data folder, and the page can remove any iPhone. Tests:
`cd status && python3 -m unittest`. Chain data lives in the app's data folder and is left out of Umbrel
backups. It needs about 300 GB, and a first sync takes days on a Pi.

Images: `ghcr.io/zeckyapp/zaino-rockit` and `ghcr.io/zeckyapp/rockit-status`,
built for arm64 and amd64 by the workflows in `.github/workflows/`. The status
image is only built after its tests pass, with build provenance attached.

## If the node stops

Zakura releases stop themselves at a set block (Zakura 1.8.9: block 3,643,309,
around 5 December 2026), so every node runs a recent version. Rock it reads
that block from the node, the page counts down to it, and it warns two weeks
ahead. A new Rock it version with the next Zakura normally comes before then.

If no update comes in time, the page says "Node update needed". Your funds are
safe, but wallets that use your Rock see no new blocks. Until the update is
there, point your wallet at a public light-wallet server in its network
settings, and switch back afterwards. A public server sees which wallet asks
what, so only do this for the days you need it.

If the page says "Wallets paused", the node is fine but the wallet server
(Zaino) stopped following it. Restart Zecky Rock it in Umbrel first. If that
does not help, the steps to go back to the previous Zaino build are in
`docs/findings.md`.

## The Zaino patches

Zaino is patched for one reason: wallets on the ECC SDK (which Lock it and
Flip it use) ask for all Sapling and Orchard subtree roots when they start, and
stock Zaino looks up one block per root (about 1,100 of them). On a Pi that
takes minutes, the wallet gives up after about 30 seconds, and it never gets
past "Starting".

- `0001-subtree-roots-without-block-lookups.patch`: answers straight from the
  node's subtree list. The completing block's height is the subtree's end
  height; the completing block hash is left empty. The ECC SDK stores only the
  root and the height. **A wallet that needs that hash will not get it from
  Rock it.**
- `0002-treestate-by-height-from-node.patch`: a tree state asked for by height
  goes straight to the node, skipping a check that downloads the whole block
  when Zaino has no index of its own.

Both are worth reporting upstream to ZingoLabs, so they can be fixed for
everyone and dropped here.

## Licences

Zaino is Apache-2.0 (Copyright ZingoLabs), see `LICENSES/Apache-2.0-Zaino.txt`.
Zakura is MIT or Apache-2.0. The patches are changes to Zaino and are offered
under Apache-2.0 too. Everything else in this repository (the Umbrel app, the
status page and the Rock it iPhone app) is MIT, see `LICENSE`. The status page
also ships qrcode-generator by Kazuhiko Arase (MIT, `status/qr.js.LICENSE`)
and the Inter and Newsreader fonts (SIL Open Font License, `status/fonts/`).
