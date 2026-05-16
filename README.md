# phone-remote

Self-hosted Android phone-farm: mirror and control many phones from your browser, over Tailscale.

The hub is a Fastify server that talks ADB on your behalf, launches `scrcpy-server` on each phone, and relays the H.264 video stream over WebSockets to a React + WebCodecs UI. Phones reach the hub via a self-hosted Headscale tailnet — no port-forwarding, no public ADB exposure.

```
browser  ──HTTPS/WSS──►  hub (Fastify)  ──TCP──►  local adb-server
                              │                       │
                              │                       ▼
                              │                   Android phones  (Tailscale 100.x.y.z:5555)
                              │
                              ├─► Headscale REST  (mint preauth keys for new phones)
                              └─► adb CLI         (adb pair / connect / tcpip 5555 during enrollment)
```

## What it does today

- **Operator console** — fleet status bar + thumb grid + detail workbench with controls (Vol, Home, Back, Recents, Power, Screenshot, Reboot, type-text). Mouse and keyboard input can be fanned out to multiple phones independently.
- **Dense grid** — N-tile monitoring view for batch ops.
- **Dual-stream scrcpy** — thumbnails get 480p / 1 Mbps / 15 fps; the focused tile gets 1280p / 6 Mbps / 30 fps. Hot-swap on focus.
- **Phone provisioning** — `+ Add device` mints a Headscale auth key tagged `tag:phone`; once the phone joins the tailnet you type its pairing port + code and the hub runs `adb pair / connect / tcpip 5555`.
- **Scenes** — named device sets, persisted to localStorage; switching scenes applies the selected serial set atomically.
- **Auth** — single admin user, bcrypt-hashed password, `@fastify/secure-session` cookie. Every route except `/`, `/assets/*`, `/health`, `/api/auth/login`, `/api/auth/me` requires a session.

## Architecture

```
apps/hub/          Fastify backend. tsx-only, no build step.
apps/web/          React 19 + Vite 8 + Tailwind 4 + Zustand. Built into apps/web/dist for prod.
packages/protocol/ Zod schemas shared between hub and web.
infra/             env.example + serve.sh (Tailscale Serve).
docs/              Operating notes, deferred work.
```

Per-package details and gotchas live in [`CLAUDE.md`](CLAUDE.md) — wire format, ESM `.js` extension requirement, ADB library choice, Headscale ACL syntax quirks.

## Quick start (development)

```bash
# Prereqs: Node 20+, pnpm, adb on PATH

pnpm install
cp infra/env.example .env.production
# Fill in SESSION_SECRET, AUTH_PASSWORD_HASH, optionally HEADSCALE_*

pnpm dev          # hub on :4000, web on :5173 (Vite proxy → hub)
```

Generate a password hash:

```bash
pnpm -F @phone-remote/hub run hash-password "yourpass"
# put the output in AUTH_PASSWORD_HASH
```

Generate a session secret:

```bash
openssl rand -hex 32
# put the output in SESSION_SECRET
```

## Quick start (production / VPS)

```bash
adb start-server                              # platform-tools installed
cp infra/env.example .env.production          # fill in secrets, then chmod 600
pnpm install --frozen-lockfile
pnpm -F @phone-remote/web build               # production bundle
pnpm -F @phone-remote/hub start               # foreground; wrap in tmux/pm2/etc.
```

For HTTPS via Tailscale, after installing the Tailscale client:

```bash
bash infra/serve.sh               # publishes https://<host>.<tailnet>.ts.net
```

## Headscale

The hub is wired to mint preauth keys via Headscale's REST API. Set:

```
HEADSCALE_URL=https://headscale.example.com
HEADSCALE_API_KEY=hskey-api-...
HEADSCALE_USER_ID=1
PROVISION_TAG=tag:phone
```

Minimum ACL policy (`/etc/headscale/acl.json`):

```hujson
{
  "groups":   { "group:admins": ["operator@"] },
  "tagOwners":{ "tag:phone": ["group:admins"], "tag:hub": ["group:admins"] },
  "acls":     [{ "action": "accept", "src": ["tag:hub"], "dst": ["tag:phone:5555"] }]
}
```

Tag the hub itself with `tag:hub` when bringing it onto the tailnet, e.g.
`sudo tailscale up --login-server <headscale-url> --authkey <preauth-key>` (with the key minted via `headscale preauthkeys create --tags tag:hub`).

## Tests

```bash
pnpm test          # vitest run — 64 tests covering protocol, auth, routes, wire format, stores
pnpm test:watch    # interactive
```

## Stack

| Layer | What |
|---|---|
| Backend | Fastify 5, `@fastify/secure-session`, `@fastify/static`, `@fastify/websocket` |
| ADB | Tango — `@yume-chan/adb`, `@yume-chan/adb-scrcpy`, `@yume-chan/adb-server-node-tcp` |
| scrcpy | `scrcpy-server` v3.3.3 (downloaded lazily on first launch) |
| Frontend | React 19, Vite 8, Tailwind 4, Zustand 5, lucide-react, `@yume-chan/scrcpy-decoder-webcodecs` |
| Validation | Zod 4 (one schema set shared by hub + web) |
| Tests | Vitest 4 + happy-dom |
| Tailnet | Headscale 0.28 + Tailscale 1.96 |

## Status

- ✅ Stack wired end-to-end on a Linux VPS
- ✅ Hub-to-Headscale flow verified (real preauth key minted)
- ✅ Auth, routes, wire format, stores covered by Vitest
- ✅ Lighthouse a11y 100/100
- ⚠️ No physical Android device has been streamed yet — see [`docs/DEFERRED.md`](docs/DEFERRED.md) #1
- ⚠️ Hub is plain HTTP on `127.0.0.1:4000`; HTTPS via Tailscale Serve is one command away — see [`docs/DEFERRED.md`](docs/DEFERRED.md) #2

Picking order for what to do next is in [`docs/DEFERRED.md`](docs/DEFERRED.md).
