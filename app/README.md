# Zecky Rock it (iPhone)

The iPhone app for Rock it, the Zcash node at home. It shows how the node is
doing (sync, peers, drive, whether wallets can connect) and the address to
enter in Zecky Lock it and Zecky Pocket.

It pairs once with the Rock it app on the Umbrel: tap Scan in the app (or
point the iPhone Camera at the QR code on the Rock it page; it is a
`rockit://pair` link that opens this app), or type the eight-character code.
The scanner uses Apple's own camera framework and keeps nothing. Pairing gives this iPhone its own key, kept
in the Keychain (this device only, never in backups). After that it reads
`/phone/status` with that key: first at the home address, then at the
Tailscale address. No wallet keys, no funds, no other servers. The Umbrel page
can remove an iPhone at any time. Needs Zecky Rock it 0.3.0 or newer.

Everything goes over HTTPS on the Rock's own port (8139), with the Rock's own
certificate. The QR carries the certificate's SHA-256 fingerprint, and
`native/rockit-tls` (a small native module) trusts that certificate and no
other. A typed code has no fingerprint: the app trusts the Rock that answers
at that moment and keeps its fingerprint from then on.

The app hides its screen in the app switcher.

## Test pairing in the Simulator

The Simulator has no camera. Either type the code from the Umbrel page, or
open the QR's link directly (with the code shown on the page):

```
xcrun simctl openurl booted "rockit://pair?h=umbrel.local&c=ABCD2345&t=8139&k=FINGERPRINT"
```

## Build on the Mac

```
cd app
npm run setup              # npm ci --ignore-scripts
cd ios && bundle install && bundle exec pod install && cd ..
open ios/RockIt.xcworkspace
```

In Xcode: pick your team under Signing & Capabilities (bundle ID
`app.zecky.rockit`), choose the iPhone, Run.

## Checks

```
npx tsc --noEmit && npx eslint App.tsx src __tests__ && npx jest
```

## Layout

| Path | What |
| --- | --- |
| `App.tsx` | Setup until a Rock is saved, then the status screen |
| `src/lib/address.ts` | Reading addresses; home and Tailscale ranges |
| `src/lib/status.ts` | Fetching and reading `/api/status` |
| `src/lib/check.ts` | Home first, then Tailscale |
| `src/lib/rock.ts` | The saved Rock and its device id (iOS Settings store) |
| `src/lib/pair.ts` | The QR link, the code, and trading it for a key |
| `src/lib/key.ts` | This iPhone's key (iOS Keychain) |
| `src/lib/https.ts` | Requests to the Rock over pinned HTTPS |
| `native/rockit-tls/` | Native code: HTTPS that checks the Rock's fingerprint, and the QR scanner |
| `src/screens/` | Setup and status screens |
| `assets/icon/` | App icon (`make-icon.py` draws the copper Z, run from `app/`) |
