# Zecky Rock it (iPhone)

The iPhone app for Rock it, the Zcash node at home. It shows how the node is
doing (sync, peers, drive, whether wallets can connect) and the address to
enter in Zecky Lock it and Zecky Pocket.

It only reads `/api/status` from the Rock it app on the Umbrel (port 8138):
first at the home address, then at the Tailscale address. No keys, no funds,
no other servers. Needs Zecky Rock it 0.1.1 or newer on the Umbrel, which
opens that read-only status without an Umbrel login.

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
| `src/lib/rock.ts` | The saved Rock (iOS Settings store) |
| `src/screens/` | Setup and status screens |
| `assets/icon/` | App icon (`rock-it-icon.svg`, rendered to 1024 px) |
