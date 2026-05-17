# phone-remote

Self-hosted Android phone-farm: mirror and control many phones from your browser, over a self-hosted Tailscale tailnet.

The hub is a Fastify server that talks ADB on your behalf, launches `scrcpy-server` on each phone, and relays the H.264 video stream over WebSockets to a React + WebCodecs UI. Phones reach the hub via Headscale — no port-forwarding, no public ADB exposure.

```
browser  ──HTTPS/WSS──►  hub (Fastify)  ──TCP──►  local adb-server
                              │                       │
                              │                       ▼
                              │                   Android phones  (Tailscale 100.x.y.z:5555)
                              │
                              ├─► Headscale REST  (mint preauth keys for new phones)
                              └─► adb CLI         (adb pair / connect / tcpip 5555 during enrollment)
```

## What it does

- **Operator console** — fleet status bar + thumb grid + detail workbench with controls (Vol, Home, Back, Recents, Power, Screenshot, Reboot, type-text). Mouse and keyboard input can be fanned out to multiple phones independently.
- **Dense grid** — N-tile monitoring view for batch ops.
- **Dual-stream scrcpy** — thumbnails get 480p / 1 Mbps / 15 fps; the focused tile gets 1280p / 6 Mbps / 30 fps. Hot-swap on focus.
- **Phone provisioning** — `+ Add device` opens a multi-stage modal. Tailnet mode mints a Headscale auth key tagged `tag:phone` and walks the operator through `Tailscale onboarding → ADB pairing`. LAN mode supports both QR (Wireless debugging mDNS) and manual pairing-code flows. USB-over-TCP shortcut available when the phone is tethered.
- **Scenes** — named device sets, persisted to localStorage; switching scenes applies the selected serial set atomically.
- **Auth** — single admin user, bcrypt-hashed password, `@fastify/secure-session` cookie. Every route except `/`, `/assets/*`, `/health`, `/api/auth/login`, `/api/auth/me` requires a session.
- **Assistant** — `/api/assistant/chat` with provider switcher (Claude OAuth, Anthropic API, OpenAI, Gemini, DeepSeek, Ollama, generic OpenAI-compatible). Tool use is wired through to device actions.

## Architecture

```
apps/hub/                          Fastify backend. tsx-only, no build step.
  src/
    app.ts                         Composition root — probes capabilities, decorates Fastify, registers routes.
    server.ts                      Process entry — loads env, starts the app, optional adb-server bootstrap.
    capabilities.ts                Boot-time mDNS + tailnet probe.
    fastify-augment.d.ts           FastifyInstance decorations (capabilities, provisioning).
    routes/                        Per-domain route registration.
    provisioning/                  Service + adapters + guards + state graph + error map.
    shared/                        AppError, http-errors, circuit-breaker, idempotency, invariant.
apps/web/                          React 19 + Vite 8 + Tailwind 4 + Zustand 5.
packages/protocol/                 Zod schemas + types shared between hub and web (wire contract).
infra/                             env.example, Headscale install/config, Tailscale Serve script.
docs/                              DEFERRED.md — prioritized backlog of explicitly out-of-scope items.
```

## Provisioning model

The provisioning subsystem went through a structural overhaul; the design now follows six explicit principles. Each is testable in isolation.

| Concern | Mechanism |
|---|---|
| Mode mismatch (e.g. QR in tailnet, which can't work because mDNS doesn't cross WireGuard) | `session.kind: 'tailnet' \| 'lan'` immutable at start; `requireSessionKind` guard |
| Infrastructure missing (mDNS socket can't bind on this host) | Boot-time probe → `HubCapabilities` decorated onto Fastify; `requireMdnsCapability` guard |
| Concurrent ops over the same session | Single `IdempotencyGate` per sessionId; fingerprints carry the op kind so same-op same-body coalesces, cross-op throws 409 |
| Bonjour socket failures | `.on('error')` listeners on every browser; translated to typed `MdnsUnavailableError` |
| Illegal status transitions | `transition(session, to)` helper checks the state graph table; illegal jumps throw `InvariantViolationError` → 500 |
| Headscale failures | `TailnetError` carries upstream HTTP status; mapped 401/403 → 502, 5xx → 503, other → 502 |
| ADB pair failures | `AdbPairFailedError` typed (vs. `AdbConnectFailedError`); both → 502 |
| Cold-start mDNS overhead | Long-lived `MdnsService` singleton with warm browsers per service type |
| Unknown errors masquerading as 502 | Catch-all 500 `unexpected_provisioning_error` (expose:false) means "hub bug" rather than burying everything under `provisioning_failed` |

The composition root (`app.ts`) probes capabilities, constructs the service with that snapshot, and decorates Fastify:

```ts
const caps = await probeCapabilities();
app.decorate('capabilities', caps);
app.decorate('provisioning', createDefaultProvisioningService(caps));
```

Routes consume via `req.server.capabilities` / `req.server.provisioning`. No module-level singletons, no service-locator globals.

## Quick start (development)

```bash
# Prereqs: Node 20+, pnpm, adb on PATH

pnpm install
cp infra/env.example .env.production
# Fill in SESSION_SECRET, AUTH_USER, AUTH_PASSWORD_HASH, optionally HEADSCALE_*

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

Or via Docker — single-service compose with host networking so the hub can reach the host's Tailscale interface and adb-server without port-mapping:

```bash
touch .env.local                              # otherwise Docker creates this path as a directory
docker compose up -d --build
docker compose logs -f hub
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

## Assistant providers

Enable at least one to surface the assistant panel:

| Provider | Env vars |
|---|---|
| Claude OAuth | `CLAUDE_OAUTH_TOKEN=sk-ant-oat01-…` (wins, treated as long-lived) **or** run `claude` once so the hub reads `~/.claude/.credentials.json` (auto-refreshes) |
| Anthropic API | `ANTHROPIC_API_KEY=sk-ant-…` |
| OpenAI | `OPENAI_API_KEY=sk-…` (+ optional `OPENAI_BASE_URL`) |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY=…` |
| DeepSeek | `DEEPSEEK_API_KEY=sk-…` |
| Ollama | `OLLAMA_BASE_URL=https://host:port/v1` (OpenAI-compatible path; TLS verification disabled for this provider) |
| OpenAI-compatible | `OPENAI_COMPATIBLE_BASE_URL=…` (+ optional `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_LABEL`) |

The header dropdown in the assistant panel only lists providers whose env vars are present.

## Tests

```bash
pnpm test          # vitest run — 195 tests
pnpm test:watch    # interactive
```

Suites cover:

- **Provisioning** (`tests/provisioning.test.ts`) — start, pair, qr-pair, race-tightening (single gate), session kind discriminator.
- **mDNS infra** (`tests/mdns-unavailable.test.ts`, `tests/mdns-warm-cache.test.ts`) — typed errors on bind failure, capability short-circuit, warm-cache fast path.
- **State transitions** (`tests/session-transitions.test.ts`) — every cell of the legal-transition table (allowed × illegal × idempotent).
- **Error mapping** (`tests/error-map.test.ts`) — every typed error class → HTTP status, plus the unknown-error catch-all.
- **Claude OAuth** (`tests/claude-oauth-env.test.ts`) — `CLAUDE_OAUTH_TOKEN` precedence over `credentials.json`.
- **App / routes** (`tests/app.test.ts`) — boot guards, auth gate, route smoke tests.
- **Auth** (`tests/auth.test.ts`) — bcrypt + secure-session round-trip.
- **Env loader** (`tests/env-loader.test.ts`) — `.env` / `.env.local` precedence + reload.
- **Settings PATCH** (`tests/settings.test.ts`) — hot-reload writes to `.env.local`.
- **Shared utils** (`tests/shared/*.test.ts`) — circuit breaker, http error mapping, idempotency gate.
- **Scrcpy preset** (`tests/scrcpy-preset.test.ts`, `tests/scrcpy.test.ts`) — option-string assembly + main/thumb defaults.
- **Stream wire format** (`tests/stream.test.ts`) — `ClientMessage` / `ServerMessage` round-trip.
- **Web stores** (`apps/web/tests/*.test.ts`) — devices, scenes, filters, fanout, touch, assistant, provisioning store, server-settings, stream socket, device actions.
- **Protocol** (`packages/protocol/tests/*.test.ts`) — Zod schema invariants.

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
| AI SDK | `ai` + `@ai-sdk/{anthropic,openai,google,deepseek,openai-compatible}` |

## Status

- ✅ Stack wired end-to-end on a Linux VPS
- ✅ Hub-to-Headscale flow verified (real preauth key minted)
- ✅ Provisioning subsystem hardened end-to-end — see the principles table above
- ✅ Test suite covers state transitions, error mapping, race tightening, mDNS infra failure, env precedence
- ✅ Lighthouse a11y 100/100
- ⚠️ Real-device smoke test passed on the operator's stack; broader phone matrix still unvalidated
- ⚠️ Hub default bind is `127.0.0.1`; HTTPS for tailnet/public access is one of Tailscale Serve, Caddy in front, or Caddy/nginx reverse-proxy

Picking order for what to do next is in [`docs/DEFERRED.md`](docs/DEFERRED.md).
