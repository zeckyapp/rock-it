# Other wallets (Zodl, Vizor, …)

Design for an option on the Rock it page that lets any Zcash wallet with a
custom-server setting use the Rock, at home and away. Status: proven by hand
and prototyped, not built yet.

## Why

Zecky Lock it and Pocket reach Zaino on the home address without TLS (they
are patched to allow that on private addresses). Stock wallets such as Zodl
and Vizor only connect over HTTPS with a certificate they trust, so they
cannot use the Rock today. The plain wallet port also lets anyone on the home
network see that a Zcash wallet is in use and when it sends.

## Proven by hand

On a Raspberry Pi 5 with umbrelOS and its Tailscale app (October 2026):

    tailscale serve --bg --https=9067 http://127.0.0.1:8137

- Zodl: custom server `<name>.<tailnet>.ts.net:9067`, syncs and shows the
  balance.
- Vizor: custom endpoint `https://<name>.<tailnet>.ts.net:9067`, syncs and
  sends.

Tailscale ends TLS with a publicly trusted certificate and passes gRPC on to
Zaino unchanged. Not checked yet: Cake Wallet.

## What the owner sees

On the Rock it page, under the addresses:

- **Other wallets (Zodl, Vizor, …): Off** · *Turn on*
- Turn on → explains what becomes public (below) → shows a Tailscale login
  link → after login: the address with a copy button and how to enter it
  in Zodl and Vizor.
- If HTTPS certificates are off in the owner's Tailscale account, the page
  says so and where to switch them on (one switch in the admin console).
- Turn off → Rock it logs out of Tailscale; the address stops working.

The owner needs a Tailscale account and the Tailscale app on the phone. No
Terminal or SSH. Owners who only use Zecky never see any of this.

## Privacy: what becomes public

A trusted HTTPS certificate is logged in public certificate-transparency
logs. Once the option is on, the name `rockit.<tailnet>.ts.net` is public.
It does not reveal the home address or IP. There is no way around this with
a certificate that Zodl and Vizor trust, so the option is off by default and
the page says this before turning it on.

The address only answers inside the owner's own Tailscale network, not on
the internet.

## How it works

- A `tailscale` container in Rock it (official image, pinned by digest),
  hostname `rockit`, userspace networking, state in `data/tailscale`.
- It runs `tailscaled` directly as user 1000 (not root, no start script).
- Its Serve config: HTTPS on 9067 → Zaino on Rock it's own network. Nothing
  else is served; no subnet routes, no exit node, no Tailscale SSH.
- Until the owner logs in, it is not on any tailnet and serves nothing.
- The status server drives it through Tailscale's local API (a socket shared
  between the two containers): read the state and login link, start a login,
  log out.

## Prototype results (October 2026)

Tried by hand on the home Umbrel, next to Rock it 0.3.8:

- Tailscale's start script (`containerboot`) waits 60 seconds for a login,
  then stops; Docker restarts it in a loop. Rock it runs `tailscaled`
  directly instead (`--tun=userspace-networking`), which waits quietly,
  logged out, until the page starts a login.
- The local API lets only tailscaled's own user make changes. Run as root,
  the status server (user 1000) got 403 on `login-interactive`. Run as user
  1000, the same as the status server, it got 204. Tailscale then also runs
  without root.
- Through the local API the status server can do everything the page
  needs: `PATCH /localapi/v0/prefs` (hostname `rockit`), `POST
  /localapi/v0/login-interactive`, `GET /localapi/v0/status` (`AuthURL`,
  `BackendState`, `Self.DNSName`, `CertDomains`), `POST
  /localapi/v0/serve-config` and log out.
- Serve in userspace mode proxies to Zaino on Rock it's own network
  (`http://10.137.42.11:8137`). Vizor connected to
  `https://rockit.<tailnet>.ts.net:9067` within a second.

## Open questions left

1. The Tailscale container sits on Rock it's own network, so it could reach
   the node's RPC (no password). Accepted for now: Tailscale serves only the
   one port, and the image is pinned. A password on the RPC is on the list.
2. Whether Lock it and Pocket can move to the same HTTPS address later, so
   the plain wallet port can close.

## Testers

Nothing changes for testers who only use Zecky. Testers who want Zodl or
Vizor: Tailscale account, HTTPS switch on, then Turn on on the page.
