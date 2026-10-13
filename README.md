# Zecky Rock it

Your own Zcash node at home, for Zecky Lock it and Zecky Pocket.

Rock it runs two programs side by side:

- **Zakura**, a Zcash full node (a faster fork of the Zcash Foundation's
  Zebra). It keeps the chain.
- **Zaino** (by ZingoLabs), a light-wallet server. It answers the wallets'
  questions by asking Zakura.

```
Lock it / Pocket  --8137-->  Zaino  --RPC 8232-->  Zakura  --8233-->  Zcash network
                             (rockitnet, a private Docker network)
```

The wallets keep their keys. Rock it holds no keys and no funds.

## Layout

| Path | What |
| --- | --- |
| `compose.yml` | Zakura and Zaino, their private network and ports |
| `zaino/Dockerfile` | Builds Zaino 0.10.2 with the Rock it patches |
| `zaino/patches/` | The Rock it changes to Zaino |
| `zaino/zainod.toml` | Zaino's settings |
| `scripts/rockit-status.sh` | Sync status and the Pi's health |
| `docs/findings.md` | What was learned getting this to run on a Raspberry Pi 5 |

## Running it

On the Pi (umbrelOS, data on the SSD at `/mnt/data`):

```
sudo docker compose up -d --build
sudo sh scripts/rockit-status.sh
```

The first build of Zaino takes about an hour on a Raspberry Pi 5.

Zakura needs the chain before it is useful: either a full sync (days) or one
of Zakura's snapshots (`docs/findings.md`).

In Lock it or Pocket: Settings, Network, Add a server. Use the Pi's home
address (for example `192.168.1.20:8137`) and its Tailscale address
(`100.x.x.x:8137`) for when you are away, each under its own name.

## The Zaino patches

Zaino is patched for one reason: wallets on the ECC SDK (which Lock it and
Pocket use) ask for all Sapling and Orchard subtree roots when they start, and
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

Zaino is Apache-2.0 (Copyright ZingoLabs). Zakura is MIT or Apache-2.0. The
patches are changes to Zaino and are offered under Apache-2.0 too.
