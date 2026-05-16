# Deferred work

Things explicitly scoped out of the current build. Each entry says *why it's not done*, *how to pick it up*, and *what it touches*. Pull from the top down by impact.

---

## 1. Real Android phone smoke test
**Status:** mocked end-to-end, never run against a real device.

**Why deferred:** No physical Android available during the build session. Provisioning was verified by minting a real Headscale preauth key and tracing the flow with curl + chrome-devtools; the scrcpy stream path was verified by error-handling a non-existent device.

**Approach:**
1. Install Tailscale Android on a phone, enable Developer Options → Wireless Debugging.
2. From a tailnet-connected browser, hit `+ Add device` in the hub.
3. Copy auth key + login server to the phone's Tailscale "Use auth key" entry.
4. Enable Wireless Debugging, tap "Pair device with pairing code", read IP / pair port / connect port / 6-digit code.
5. Type those back into the hub modal. Hub will run `adb pair / connect / tcpip 5555`.
6. Phone appears in `/devices`; open it in Detail and verify the stream/control path.

**Touches:** nothing in code. Just operational.

**Risk if skipped:** every assumption about the scrcpy server protocol, dual-stream switching, and pointer-event coordinate mapping is unverified.

---

## 2. HTTPS for the hub
**Status:** hub binds `127.0.0.1:4000`, plain HTTP.

**Why deferred:** Only operator was the developer behind SSH. Public access (or even tailnet access from another machine) needs TLS so the password cookie isn't sent plaintext.

**Approach (Tailscale Serve — recommended):**
```
bash infra/serve.sh
```
That publishes the hub on `https://<host>.<tailnet>.ts.net:443` with Tailscale-issued cert. Only tailnet members can reach it.

**Approach (Caddy on a public path):** put Caddy on `:8443` (since `:443` is Headscale), reverse-proxy to `127.0.0.1:4000`, auto-cert via Let's Encrypt for a DNS name like `hub.<domain>.<sslip-or-real>`. Then set `COOKIE_SECURE=true` in `.env.production` and `HOST=0.0.0.0`.

**Touches:** `infra/serve.sh` (already exists) OR a new Caddyfile under `infra/`. Plus `.env.production` for `COOKIE_SECURE=true`.

---

## 3. Worker-per-tile decoder
**Status:** all WebCodecs decoders run on the main thread.

**Why deferred:** with <9 visible tiles the main thread keeps up. We chose to ship the layout first and optimize when it actually janks.

**Approach:**
1. Move `useScrcpyStream` body into a `decoder.worker.ts` Worker.
2. Transfer the `OffscreenCanvas` from `Tile.tsx` to the worker via `canvas.transferControlToOffscreen()`.
3. Worker opens the WebSocket directly (WS is available in workers) so binary frames never touch the main thread.
4. Worker posts back `video-meta` messages and pointer-event ACKs.
5. Pointer events flow main thread → worker via `postMessage`.

**Touches:** `apps/web/src/hooks/useScrcpyStream.ts`, `Tile.tsx`, new `apps/web/src/workers/decoder.worker.ts`. Vite handles worker bundling natively.

**Estimated scope:** ~200 LoC.

---

## 4. APK upload (Install APK button)
**Status:** `StreamToolbar` has no install button; route doesn't exist.

**Why deferred:** Needs `@fastify/multipart`. Out of scope for the streaming MVP.

**Approach:**
1. `pnpm add -F hub @fastify/multipart`
2. Register it in `app.ts` with size limit (~200MB for big APKs).
3. New route `POST /api/dev/:serial/install` — accept the file, write to a temp path, call Tango's `adb.install()` (or `adb install` shell-out with progress).
4. Frontend: add an `<input type="file" accept=".apk">` to `StreamToolbar`. When `keyboardSync` is on, fan out to all selected.

**Touches:** `apps/hub/package.json`, `apps/hub/src/app.ts`, `apps/hub/src/routes.ts`, `apps/hub/src/device-actions.ts`, `apps/web/src/StreamToolbar.tsx`.

---

## 5. `adb-auto-enable` integration for reboot persistence
**Status:** wireless debugging dies on every phone reboot; users must re-pair manually.

**Why deferred:** Requires shipping the [adb-auto-enable APK](https://github.com/mouldybread/adb-auto-enable) and installing it on each phone during provisioning. Operational complexity.

**Approach:**
1. Bundle a known-version APK under `apps/hub/vendor/`.
2. During pairing (`provisioning.ts`), after `adb connect 100.x.y.z:5555` succeeds, run `adb install adb-auto-enable.apk` and `adb shell pm grant ... WRITE_SECURE_SETTINGS`.
3. Document for operators that the phone needs to open the app once to grant root pairing self-permission.

**Touches:** `apps/hub/src/provisioning.ts`, `apps/hub/vendor/`.

---

## 6. Headscale database backup
**Status:** none. If `/var/lib/headscale/db.sqlite` is lost, every paired phone is orphaned and must re-pair.

**Why deferred:** not part of the build, but critical for any actual fleet operation.

**Approach (simplest):** cron job that runs `sqlite3 /var/lib/headscale/db.sqlite ".backup /var/backups/headscale-$(date +%Y%m%d).db"` daily, with retention.

**Approach (better):** the same, plus `rclone` push to S3-compatible storage. Or an off-VPS WireGuard target.

---

## 7. Real rate-limit on `/api/auth/login`
**Status:** `routes.ts` has a `setTimeout(400)` on failure. Not actually a rate limiter — just a per-request stall.

**Why deferred:** not load-bearing for a single-operator setup, becomes important if exposed publicly.

**Approach:**
1. `pnpm add -F hub @fastify/rate-limit`.
2. Register globally with conservative defaults, then a stricter limit on `/api/auth/login` (e.g. 5 attempts / 5 min / IP).

**Touches:** `apps/hub/package.json`, `apps/hub/src/app.ts`, `apps/hub/src/routes.ts`.

---

## 8. `trackDevices()` push instead of polling
**Status:** Web fetches `/devices` once on mount. Plugging in a USB phone doesn't update the sidebar until manual refresh.

**Why deferred:** Tango exposes `AdbServerClient.trackDevices()` which streams events. Wiring it through a WebSocket to the browser is its own mini-feature.

**Approach:**
1. New WS route `/ws/devices` on the hub.
2. Hub subscribes to `client.trackDevices()`; pushes `{added: Device, removed: serial, ...}` events to all connected browsers.
3. `apps/web/src/stores/devices.ts` opens that WS and applies events. Replace the manual `refresh()` action with reactive updates.

**Touches:** `apps/hub/src/adb.ts`, `apps/hub/src/routes.ts`, new WS handler, `apps/web/src/stores/devices.ts`.

---

## 9. Drag-to-rearrange tiles + edit-mode lock
**Status:** thumb grid renders in sidebar-checkbox order.

**Why deferred:** Operators don't need this until they have ≥10 tiles. Reference: Frigate `DraggableGridLayout.tsx`.

**Approach:** use `dnd-kit` (~6KB gzipped). Lock/unlock toggle in topbar; locked = no dragging. Persist tile order in the active scene (`Scene.serials` is already ordered).

**Touches:** `apps/web/src/Grid.tsx`, `apps/web/src/Tile.tsx`, `stores/scenes.ts`.

---

## 10. Auto-promote tile on event
**Status:** none.

**Why deferred:** depends on event source. FPS-drop watchdog is easy; "app crash" or "captcha detected" needs image diffing.

**Approach (FPS-drop only):**
1. `useScrcpyStream` already tracks frame timestamps; expose a `framesRendered` value via a callback.
2. New `useFpsWatchdog` hook flags a tile as stale after N seconds without frames.
3. On stale, call `useDevicesStore.getState().enterDetail(serial)` to promote.

**Touches:** `apps/web/src/hooks/useScrcpyStream.ts`, new watchdog hook, `Grid.tsx` / `Detail.tsx`.

---

## 11. In-browser ADB shell (xterm.js)
**Status:** API endpoint `POST /api/dev/:serial/shell` exists; no UI.

**Why deferred:** Bigger UX scope than the current toolbar covers. Useful for power users.

**Approach:** drawer triggered from `StreamToolbar`. Wraps `xterm.js` connected via a new WS that pipes stdin/stdout through Tango's `subprocess.shellProtocol.pty()`.

**Touches:** new `ShellDrawer.tsx`, new WS route `/ws/dev/:serial/shell`, deps: `xterm`, `@xterm/addon-fit`.

---

## 12. Mobile responsive layout
**Status:** **explicitly rejected**, not "deferred".

Operator workstation is desktop. Adding responsive breakpoints to the grid/detail workbench was discussed and skipped (see [git log: `Bump web accessibility score`](../README.md) for context — that audit raised the question, user picked option 1, "Skip — desktop-only is fine").

Re-open only if the product positioning changes to "remote control from any device including mobile."

---

## Picking order suggestion
1. **#1 (real phone test)** — biggest unknown, unblocks everything else
2. **#2 (HTTPS)** — required before tailnet exposure for other operators
3. **#3 (worker-per-tile)** — performance, load-bearing for dense multi-device monitoring
4. **#6 (DB backup)** — operational hygiene
5. **#4 (APK install)** — utility win
6. The rest as needed
