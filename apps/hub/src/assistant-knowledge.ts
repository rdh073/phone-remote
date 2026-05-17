/**
 * Operator-facing knowledge base for the assistant.
 *
 * Static text snippets the model fetches via the `usage_guide` tool when the
 * operator asks "how do I…" questions. Kept here instead of in the system
 * prompt so the per-request token bill stays small and the model only loads
 * what it needs.
 *
 * Keep each topic terse and workflow-focused — the model paraphrases for the
 * operator anyway; this is reference, not prose.
 */

export interface KnowledgeTopic {
  id: string;
  summary: string;
  body: string;
}

export const KNOWLEDGE: KnowledgeTopic[] = [
  {
    id: 'overview',
    summary: 'What phone-remote is and how the console is laid out',
    body: `# Phone-remote — overview

A self-hosted phone-farm console: the operator picks an Android phone in the
browser and gets a low-latency scrcpy stream with touch/key input. Phones
reach the hub over Tailscale (not USB) once onboarded.

Console layout:
- **Topbar**: refresh, sync toggle, wallboard, scenes, scratchpad, assistant.
- **Sidebar**: filters by state / location / tag / model.
- **Grid**: device tiles. Click to select; Ctrl/Shift for multi-select.
- **Detail**: per-device drawer with controls + bigger stream.
- **Activity drawer**: history of operator actions.
- **Assistant**: bot icon (top right) opens this chat panel.

Hub speaks ADB via Tango (no \`adbkit\` etc.) and shells out to the \`adb\` CLI
only for pair / connect / tcpip during provisioning.`,
  },
  {
    id: 'onboarding',
    summary: 'Adding a new device — Tailscale + QR + pairing code + USB-TCP',
    body: `# Onboarding a device

Click **+ Add device** in the topbar. A wizard opens with up to four tabs.

## Stage 1 — Tailscale onboarding (when headscale is configured)
The hub mints a one-shot auth key + login server. On the phone install the
Tailscale Android app, open it, tap the ⋮ menu twice:
  1. "Use alternate server" → paste the login server URL (or scan the QR).
  2. "Sign in with auth key" → scan the auth key QR.
Once the phone shows "connected" with a 100.x.y.z address, continue to stage 2.

## Stage 2 — pair ADB. Pick the tab that fits your situation:

### Wireless debug QR (same-LAN)
On the phone: Developer options → Wireless debugging → "Pair device with QR".
Scan the QR shown in the wizard. Works only on the same LAN as the hub (mDNS).

### Pairing code (same-LAN, AP isolation workaround)
On the phone: Wireless debugging → "Pair device with pairing code". Enter
phone IP + connect port + pair port + 6-digit code into the form.

### ADB over USB (phone has no Wi-Fi, USB-tethered to operator's laptop)
Phone is plugged into your laptop via USB; phone is already on the tailnet.
  1. On the phone: tap "Allow USB debugging".
  2. On your laptop: run \`adb tcpip 5555\` (button in the wizard copies it).
  3. Look up the phone's 100.x.y.z in the Tailscale app on the phone.
  4. Enter that IP + port 5555 → Connect.
Note: \`adb tcpip\` doesn't survive a phone reboot; redo step 2 after a reboot.`,
  },
  {
    id: 'selection-scenes-sync',
    summary: 'Selecting multiple devices, saving scenes, mirroring input',
    body: `# Selection, scenes, sync mode

## Selection
- Click a tile → single select (replaces).
- Ctrl/Cmd-click → toggle one device into the selection.
- Shift-click → range select between the cursor and the click.
- Capital A on the keyboard → select all visible (after filters).
- Esc clears the selection.

The number of selected devices shows in the topbar. Most bulk actions
(scenes, key injection, screenshots from the assistant) operate on this set.

## Scenes
A scene is a saved selection. Open the scenes menu in the topbar; type a name;
hit save. Recall the scene to re-select those serials. Scenes survive reloads.

## Sync mode
Toggle in the topbar. When on, every touch / swipe / key on the active tile
is mirrored to every other selected device. Useful for QA runs across many
devices at once. The toggle is session-only (not persisted) on purpose.`,
  },
  {
    id: 'wallboard-filters',
    summary: 'Wallboard focus mode + sidebar filtering',
    body: `# Wallboard + filters

## Wallboard mode (W)
Hides the topbar, sidebar, and chrome — just the device grid, full screen.
Press W again (or click the exit button bottom-right) to leave. Session-only.

## Filters (sidebar)
The sidebar lists devices grouped by state, source (usb/tcp), location, tag,
and model. Click a chip to filter. Combinations are AND-ed. The "filter
presets" button saves the current chip selection for one-click recall.

Filter state is reflected in the URL — share a URL and the other operator
sees the same filter view.`,
  },
  {
    id: 'shortcuts',
    summary: 'Keyboard shortcuts',
    body: `# Keyboard shortcuts

Global (any focus):
- **Cmd/Ctrl+K** — open the command palette
- **?** — toggle the shortcuts overlay
- **/** — focus the sidebar search input
- **W** — toggle wallboard
- **B** — collapse / expand the sidebar
- **R** — reconnect the device under the cursor
- **Shift+L** — toggle input lock on the device under the cursor

Grid nav (when focus is in the grid, lowercase, vim-style):
- **h / j / k / l** — move the cursor left / down / up / right
- **A** — select all visible
- **Esc** — clear selection

Assistant panel:
- **Esc** — progressive close: fullscreen → docked → hidden
- **/** at empty composer — open slash commands palette
- **@** in composer — open the device mention popup`,
  },
  {
    id: 'assistant',
    summary: 'How the assistant works — tools, slash commands, mentions',
    body: `# Operator assistant

This chat panel runs against the hub's /api/assistant/chat endpoint. Tools
let me drive every device in the fleet (tap, swipe, text, key, screenshot,
shell, reboot, list_devices, plus adb_start_server / kill / restart for the
local daemon).

## Slash commands
Press \`/\` at an empty composer (or click the / button). Pick a command and
the prompt drops into the composer. Edit / add @-mentions, press Enter.
Built-ins: /clear (local), /help, /devices, /screenshot, /home, /back,
/menu, /power, /shell, /reboot. Commands tagged with a target auto-append
@mentions for every grid-selected device.

## @ mentions
Press \`@\` to open the device picker (or click the @ button). Pick a device;
\`@<serial>\` is inserted at the cursor. The assistant tools accept serial
strings directly, so the mention routes the call to the right phone.

## Providers
Header dropdown switches between Claude OAuth, Anthropic API, OpenAI,
Gemini, DeepSeek, Ollama, and a generic OpenAI-compatible slot. Only the
providers whose env vars are set on the hub are listed.

## Fullscreen + hide
Maximize button expands the drawer to full viewport. X (or Esc twice) hides
the panel without losing the chat buffer for this session.`,
  },
  {
    id: 'troubleshooting',
    summary: 'Common failures — adb daemon, scrcpy stale, tcpip-5555 fallback',
    body: `# Troubleshooting

## /devices returns 500 with ECONNREFUSED 127.0.0.1:5037
The hub's local adb-server daemon isn't running. Two fixes:
  - **Quick**: call the \`adb_start_server\` tool from this chat.
  - **Permanent**: set \`ADB_AUTO_START=1\` in the hub env so the daemon
    comes up at every hub boot.

## scrcpy crashes with "Aborted" after dev reloads
Stale scrcpy-server procs piled up on the device. Hub now verify-kills
before each launch (pkill TERM → pgrep verify → pkill KILL → retry), and
tracks live sessions per serial so close-and-relaunch is clean.

## "tcpip 5555 upgrade failed" during pairing on Android 12+
Some Android 12+ phones reject \`adb tcpip <port>\` over a wireless-debugging
TLS connection. Hub falls back to keeping the dynamic wireless-debug port
serial; the phone is still reachable but the serial changes every time the
operator toggles wireless debugging on the phone.

## Phone shows up offline / unauthorized
Open the device's Wireless debugging screen, accept the dialog. Or call
the assistant's \`adb_restart_server\` tool to nudge the daemon.

## Stream connects but doesn't render
Press R to reconnect the device under the cursor. If that doesn't help,
the scrcpy session probably hit a codec error — try with a different
device first to confirm it's not a hub-wide issue.`,
  },
];

export function knowledgeIndex(): string {
  const lines = ['Available topics — call usage_guide with one of these topic ids:'];
  for (const t of KNOWLEDGE) lines.push(`- ${t.id} — ${t.summary}`);
  return lines.join('\n');
}

export function lookupKnowledge(topic: string): string {
  const id = topic.trim().toLowerCase();
  const direct = KNOWLEDGE.find((t) => t.id === id);
  if (direct) return direct.body;
  // Fall back to substring match so the model can call usage_guide({topic:"usb"})
  // and still land on the onboarding article.
  const partial = KNOWLEDGE.find(
    (t) => t.id.includes(id) || t.summary.toLowerCase().includes(id),
  );
  if (partial) return partial.body;
  return (
    `Unknown topic "${topic}".\n\n${knowledgeIndex()}`
  );
}
