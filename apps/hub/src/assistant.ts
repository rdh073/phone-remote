import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { convertToModelMessages, stepCountIs, streamText, tool, type LanguageModel, type UIMessage } from 'ai';
import { Agent, fetch as undiciFetch } from 'undici';
import { z } from 'zod';
import { PROVIDER_IDS, ProviderIdSchema, type ProviderId } from '@phone-remote/protocol';

import { listDevices } from './adb.js';
import { killAdbServer, restartAdbServer, startAdbServer } from './adb-server.js';
import { knowledgeIndex, lookupKnowledge } from './assistant-knowledge.js';
import {
  claudeCodeFetch,
  claudeCodeHeaders,
  getValidAccessToken,
  isClaudeCodeAvailable,
} from './claude-oauth.js';
import { reboot, runShell, screenshot, sendKeyEvent } from './device-actions.js';

// Read fresh per request so PATCH /api/settings can change these live without
// restarting the hub.
const maxSteps = (): number => Number(process.env.ASSISTANT_MAX_STEPS ?? 20);
const defaultModel = (): string => process.env.ASSISTANT_MODEL ?? 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are an operator assistant for a self-hosted Android phone-farm.
You inspect and control devices in the fleet via tool calls.

## Identity model
A device is identified by its "serial" string. Two shapes are valid:
  - Tailscale-connected:  "100.64.0.5:5555"  (IPv4:port)
  - USB:                  "ABCD1234"          (alphanumeric)
Never invent a serial. Every serial you call a tool with MUST come from a prior
list_devices result or from an @-mention the operator typed (e.g. "@100.64.0.5:5555").

## Procedure
1. If you don't yet have device serials in this conversation, call list_devices
   first. Don't call list_devices when you already have the relevant serials.
2. Before tapping or swiping a device you haven't seen yet this conversation,
   call screenshot to view its current screen. The PNG comes back to you as an
   image inside the tool result — read it directly, don't ask the operator.
3. Prefer the dedicated input tools (tap / swipe / text / key) over the shell
   tool. Only fall back to shell when no dedicated tool fits (e.g. settings put,
   pm list packages, dumpsys).
4. Be concise. Report what you observed, what you did, and the outcome — no
   prefaces like "I'll …" or "Sure thing".

## Coordinates and key codes
Coordinates are absolute pixels. Screen dimensions vary per device — never
assume; rely on a fresh screenshot. Key codes are Android KeyEvent constants:
3=HOME, 4=BACK, 24=VOL_UP, 25=VOL_DOWN, 26=POWER, 66=ENTER, 82=MENU.

## adb-server lifecycle
adb_start_server / adb_kill_server / adb_restart_server control the hub's
local adb-server daemon (the broker between the hub and every USB/TCP device).
When list_devices fails with "ECONNREFUSED 127.0.0.1:5037", the daemon is
down — call adb_start_server, then retry list_devices. kill/restart drops
every active connection; only call them when the daemon is genuinely stuck.

## Documentation lookups
When the operator asks "how do I …", "what is wallboard", or any onboarding /
shortcut / troubleshooting question, call usage_guide FIRST to load the right
article, then answer. Without an argument it returns the index; pass a topic id
or substring (e.g. "usb", "shortcuts") for a specific article.

## Error protocol
On any tool error:
  1. Read the error message — it almost always tells you what to fix.
  2. If the error is transient (timeout, "device offline", ECONNREFUSED) or
     about your arguments (invalid serial, missing field), retry ONCE after
     correcting.
  3. If the second call also fails or the resource truly doesn't exist, stop
     calling that tool and report the failure to the operator with the message.
     Do NOT invent a result or guess past the error.

## Destructive actions
reboot disconnects a device for ~30 seconds and is irreversible until the
device finishes booting. shell can also be destructive depending on the
command (factory reset, pm uninstall, etc.). For both: confirm with the
operator before calling UNLESS the operator's most recent message explicitly
asked for that action.

## Ambiguity
If the operator's request is ambiguous (which device, which app, which key),
ask a single short clarifying question before any tool call. Don't guess and
don't call a destructive tool to "find out".

## Stop condition
When you have answered the operator's question or completed the requested
action, reply with plain text and stop — don't keep calling tools.`;

const Serial = z
  .string()
  .min(1)
  .describe(
    'Device serial — either a TCP address ("100.64.0.5:5555") or a USB id ("ABCD1234"). MUST come from a prior list_devices call or the operator\'s @-mention. Never invent a serial.',
  );

const CONTROL_CHARS = /[ -]/g;

function escapeForInputText(text: string): string {
  // `input text` is launched via sh -c with single-quoted arg: strip control chars
  // (input text only emits printable ones anyway) then escape literal single quotes
  // using the close-escape-reopen idiom so we can safely interpolate inside '…'.
  return text.replace(CONTROL_CHARS, '').replace(/'/g, "'\\''");
}

export const assistantTools = {
  list_devices: tool({
    description:
      'Read-only. List every device currently connected to the hub, with state ("device", "unauthorized", "offline"), source ("usb" | "tcp"), model name, and tailnet metadata when applicable. Returns an array of device records. Call this once at the start of a conversation to discover serials — every other tool needs a serial that came from here (or from an operator @-mention). Do NOT call this between every tool call; the result is stable for the duration of the conversation unless the operator pairs / disconnects a device. On ECONNREFUSED 127.0.0.1:5037, call adb_start_server first, then retry.',
    inputSchema: z.object({}),
    execute: async () => listDevices(),
  }),

  tap: tool({
    description:
      'Tap once at absolute pixel coordinates on the device screen. Use for hitting buttons, links, and tappable UI elements that you can see in a recent screenshot. Coordinates are origin-top-left, in actual screen pixels — they vary per device, so don\'t reuse coordinates across phones; screenshot each one. Do NOT use tap to scroll long distances — use swipe. Returns {ok: true} on success; the model can\'t verify what changed on the screen without a follow-up screenshot.',
    inputSchema: z.object({
      serial: Serial,
      x: z.number().int().nonnegative().describe('Absolute pixel x (origin = left edge).'),
      y: z.number().int().nonnegative().describe('Absolute pixel y (origin = top edge).'),
    }),
    execute: async ({ serial, x, y }) => {
      await runShell(serial, `input tap ${x} ${y}`);
      return { ok: true };
    },
  }),

  swipe: tool({
    description:
      'Swipe (or drag) from (x1, y1) to (x2, y2) over a duration. Use for scrolling lists, swiping between pages, drag-and-drop, and pull-to-refresh gestures. For vertical scroll inside a list, keep x constant and move y by ~half the screen height; durationMs around 200-400ms feels natural. Do NOT use swipe for a quick tap — use the tap tool. Returns {ok: true} on success.',
    inputSchema: z.object({
      serial: Serial,
      x1: z.number().int().nonnegative().describe('Start pixel x.'),
      y1: z.number().int().nonnegative().describe('Start pixel y.'),
      x2: z.number().int().nonnegative().describe('End pixel x.'),
      y2: z.number().int().nonnegative().describe('End pixel y.'),
      durationMs: z
        .number()
        .int()
        .positive()
        .max(10_000)
        .default(300)
        .describe('Total gesture duration in milliseconds (default 300; 200-400 feels natural, longer = slower drag).'),
    }),
    execute: async ({ serial, x1, y1, x2, y2, durationMs }) => {
      await runShell(serial, `input swipe ${x1} ${y1} ${x2} ${y2} ${durationMs}`);
      return { ok: true };
    },
  }),

  text: tool({
    description:
      'Type a string of text into the currently focused input field on the device. Use this AFTER you have tapped a text field to give it focus — without focus the text goes nowhere. Spaces and printable punctuation are preserved; ASCII control characters are stripped. Do NOT include newlines or pretty-printed JSON — there is no clipboard semantic, the text is typed key-by-key. Do NOT use this to type a single key like Enter — use the key tool with keyCode 66 instead. Returns {ok: true}.',
    inputSchema: z.object({
      serial: Serial,
      text: z
        .string()
        .min(1)
        .max(2000)
        .describe('Text to type. Max 2000 chars. Control characters are stripped.'),
    }),
    execute: async ({ serial, text }) => {
      await runShell(serial, `input text '${escapeForInputText(text)}'`);
      return { ok: true };
    },
  }),

  key: tool({
    description:
      'Inject a single Android KeyEvent by its numeric code. Use this for hardware/navigation keys and for committing typed text. Common codes: 3=HOME, 4=BACK, 24=VOL_UP, 25=VOL_DOWN, 26=POWER (lock/wake), 66=ENTER (commit a text field), 82=MENU. Do NOT use this to type characters — use the text tool. Returns {ok: true}.',
    inputSchema: z.object({
      serial: Serial,
      keyCode: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .describe(
          'Android KeyEvent constant (3=HOME, 4=BACK, 24/25=VOL_UP/DOWN, 26=POWER, 66=ENTER, 82=MENU).',
        ),
    }),
    execute: async ({ serial, keyCode }) => {
      await sendKeyEvent(serial, keyCode);
      return { ok: true };
    },
  }),

  screenshot: tool({
    description:
      "Read-only. Capture the device's current screen as a PNG, decoded for you in the tool result as an image attachment so you can read the UI directly — there is no separate vision step or follow-up call needed. Use this BEFORE tapping or swiping a device whose layout you haven't already seen in this conversation; reuse a recent screenshot if the screen hasn't changed since you took it. PNGs are typically 1-3 MB; don't take screenshots in a tight loop. Returns {base64, bytes} in the raw tool output (the image is in the model-facing content automatically).",
    inputSchema: z.object({ serial: Serial }),
    execute: async ({ serial }) => {
      const png = await screenshot(serial);
      const base64 = Buffer.from(png).toString('base64');
      return { base64, bytes: png.byteLength };
    },
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: [
        { type: 'text', text: `screenshot captured (${output.bytes} bytes)` },
        { type: 'image-data', mediaType: 'image/png', data: output.base64 },
      ],
    }),
  }),

  shell: tool({
    description:
      'Run an arbitrary `adb shell` command and return its combined stdout/stderr. Use only when no dedicated tool fits — common cases: `settings put global ...`, `dumpsys window`, `pm list packages`, `getprop`, `screencap`. Do NOT use shell for tap / swipe / text / key — the dedicated tools are safer and clearer. Shell can be destructive (factory reset, pm uninstall, rm) so confirm with the operator before running anything that mutates state on the phone, unless the operator explicitly asked for it. Returns {output: <combined string>}.',
    inputSchema: z.object({
      serial: Serial,
      command: z
        .string()
        .min(1)
        .max(4000)
        .describe('The exact shell command to run on the device (no leading `adb shell`).'),
    }),
    execute: async ({ serial, command }) => {
      const output = await runShell(serial, command);
      return { output };
    },
  }),

  reboot: tool({
    description:
      'DESTRUCTIVE. Reboot the device. The ADB connection drops for ~30s while the phone restarts, then the device reconnects automatically (assuming tailnet/wifi is configured to come back on boot). Use this only when the operator explicitly asked to reboot a device, or to recover from a hung/unresponsive phone — and confirm with the operator first if there is any ambiguity about which device or whether a reboot is wanted. Do NOT reboot multiple devices in parallel without explicit confirmation. Returns {ok: true, note}.',
    inputSchema: z.object({ serial: Serial }),
    execute: async ({ serial }) => {
      await reboot(serial);
      return { ok: true, note: 'reboot issued; device will be unreachable for ~30s' };
    },
  }),

  adb_start_server: tool({
    description:
      "Start the hub's local adb-server daemon (the broker between the hub and every USB/TCP device). Idempotent — no-op if the daemon is already running, so calling it speculatively is cheap. Call this FIRST when list_devices fails with `ECONNREFUSED 127.0.0.1:5037` or `Cannot connect to daemon`. Do NOT call kill or restart unless the daemon is genuinely stuck — they drop every active device connection. Returns {output: <adb message>}.",
    inputSchema: z.object({}),
    execute: async () => startAdbServer(),
  }),

  adb_kill_server: tool({
    description:
      "Stop the hub's local adb-server daemon. DROPS EVERY ACTIVE DEVICE CONNECTION on the hub. Only use this when the daemon is in a bad state and the operator asked to reset it, or as the first half of a manual restart. Prefer adb_restart_server when you really just want to bounce the daemon. Returns {output}.",
    inputSchema: z.object({}),
    execute: async () => killAdbServer(),
  }),

  adb_restart_server: tool({
    description:
      "Restart the hub's adb-server (kill, then start). DROPS EVERY ACTIVE DEVICE CONNECTION briefly while the daemon bounces. Use when adb is stuck and adb_start_server alone doesn't help, or after the operator upgraded the adb binary on the hub. Do NOT use as a generic 'fix it' — try adb_start_server first. Returns {output}.",
    inputSchema: z.object({}),
    execute: async () => restartAdbServer(),
  }),

  usage_guide: tool({
    description:
      "Read-only. Fetch operator-facing documentation for this app. Topics cover onboarding flows (Tailscale, QR, pairing code, USB-TCP), device selection / scenes / sync, wallboard mode, filters, keyboard shortcuts, the assistant itself, and troubleshooting. Call this BEFORE answering any 'how do I …' / 'what is …' / 'why is X failing' question from the operator — the documentation is authoritative for app behaviour and shortcut bindings. Call with NO argument to receive the topic index; pass a topic id or substring to fetch one article. Returns {content: <markdown>}.",
    inputSchema: z.object({
      topic: z
        .string()
        .optional()
        .describe(
          'Topic id or substring. Examples: "overview", "onboarding" (or "usb" / "qr" / "tailscale"), "selection-scenes-sync", "shortcuts", "troubleshooting" (or "adb"). Omit to list every topic.',
        ),
    }),
    execute: async ({ topic }) => {
      if (!topic || !topic.trim()) return { content: knowledgeIndex() };
      return { content: lookupKnowledge(topic) };
    },
  }),
};

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  available: boolean;
  defaultModel: string;
  models: string[];
}

interface ProviderSpec {
  id: ProviderId;
  label: string;
  defaultModel: string;
  models: string[];
  available: () => boolean;
  configHint: string;
}

// Ollama is typically reached over plain HTTP on a LAN. The supported deployment
// here is "remote Ollama behind HTTPS but addressed by IP" — the cert won't match
// the IP, so we use a dispatcher with TLS verification off for this provider only.
// Other providers keep strict TLS.
//
// IMPORTANT: pull `fetch` from the same `undici` module as `Agent`. Node's
// global fetch uses its BUNDLED undici, which doesn't accept Dispatcher
// instances from the npm-installed undici (different prototype chain → the
// SDK throws "invalid onRequestStart method"). Using undici's own fetch keeps
// the dispatcher and the client on the same module.
const ollamaInsecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
const ollamaFetch: typeof fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
  undiciFetch(input as never, { ...(init ?? {}), dispatcher: ollamaInsecureDispatcher } as never)) as unknown as typeof fetch;

const PROVIDER_SPECS: ProviderSpec[] = [
  {
    id: 'claude-oauth',
    label: 'Claude OAuth',
    get defaultModel() {
      return defaultModel();
    },
    models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
    available: isClaudeCodeAvailable,
    configHint: 'set CLAUDE_OAUTH_TOKEN, or run `claude` once to log in (auto-reads ~/.claude/.credentials.json), or set PHONE_REMOTE_CLAUDE_CREDS',
  },
  {
    id: 'anthropic-api',
    label: 'Anthropic API',
    get defaultModel() {
      return defaultModel();
    },
    models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
    available: () => Boolean(process.env.ANTHROPIC_API_KEY),
    configHint: 'set ANTHROPIC_API_KEY',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    available: () => Boolean(process.env.OPENAI_API_KEY),
    configHint: 'set OPENAI_API_KEY (and optional OPENAI_BASE_URL)',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    available: () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    configHint: 'set GOOGLE_GENERATIVE_AI_API_KEY',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    available: () => Boolean(process.env.DEEPSEEK_API_KEY),
    configHint: 'set DEEPSEEK_API_KEY',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    defaultModel: 'llama3.3:latest',
    models: ['llama3.3:latest', 'qwen2.5:14b', 'gpt-oss:20b', 'mistral-nemo:latest'],
    // Opt-in: only listed when the operator has pointed at an Ollama. No local
    // default is assumed since the supported topology is "remote, IP-addressed,
    // HTTPS with relaxed cert verification".
    available: () => Boolean(process.env.OLLAMA_BASE_URL),
    configHint:
      'set OLLAMA_BASE_URL (OpenAI-compat path, e.g. https://136.24.37.174:8443/v1 — TLS verification is disabled)',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    defaultModel: '',
    models: [],
    available: () => Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL),
    configHint:
      'set OPENAI_COMPATIBLE_BASE_URL (and optional OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_LABEL)',
  },
];

const SPEC_BY_ID = new Map(PROVIDER_SPECS.map((s) => [s.id, s]));

export function assistantCatalog(): { providers: ProviderMeta[]; defaultProvider: ProviderId | null } {
  // Only expose providers the operator has actually configured. Unconfigured
  // ones stay invisible in the dropdown — the operator edits env vars to
  // add more rather than seeing a long list of greyed-out options.
  const providers: ProviderMeta[] = PROVIDER_SPECS.filter((spec) => spec.available()).map(
    (spec) => ({
      id: spec.id,
      label:
        spec.id === 'openai-compatible' && process.env.OPENAI_COMPATIBLE_LABEL
          ? process.env.OPENAI_COMPATIBLE_LABEL
          : spec.label,
      available: true,
      defaultModel: spec.defaultModel,
      models: spec.models,
    }),
  );
  const defaultProvider = providers[0]?.id ?? null;
  return { providers, defaultProvider };
}

export function isAssistantConfigured(): boolean {
  return Boolean(assistantCatalog().defaultProvider);
}

function isProviderId(v: unknown): v is ProviderId {
  return ProviderIdSchema.safeParse(v).success;
}

async function buildModel(id: ProviderId, modelId: string): Promise<LanguageModel> {
  switch (id) {
    case 'claude-oauth': {
      const token = await getValidAccessToken();
      const provider = createAnthropic({
        authToken: token,
        headers: claudeCodeHeaders(),
        fetch: claudeCodeFetch,
      });
      return provider(modelId);
    }
    case 'anthropic-api': {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is unset');
      const provider = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return provider(modelId);
    }
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is unset');
      const provider = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
      return provider(modelId);
    }
    case 'google': {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is unset');
      }
      const provider = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      return provider(modelId);
    }
    case 'deepseek': {
      if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is unset');
      const provider = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
      return provider(modelId);
    }
    case 'ollama': {
      const baseURL = process.env.OLLAMA_BASE_URL;
      if (!baseURL) throw new Error('OLLAMA_BASE_URL is unset');
      const provider = createOpenAICompatible({
        name: 'ollama',
        baseURL,
        fetch: ollamaFetch,
      });
      return provider(modelId);
    }
    case 'openai-compatible': {
      const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
      if (!baseURL) throw new Error('OPENAI_COMPATIBLE_BASE_URL is unset');
      const provider = createOpenAICompatible({
        name: process.env.OPENAI_COMPATIBLE_LABEL ?? 'openai-compatible',
        baseURL,
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      });
      return provider(modelId);
    }
  }
}

export interface RunOptions {
  messages: UIMessage[];
  provider?: ProviderId;
  model?: string;
}

export async function runAssistantChat({ messages, provider, model }: RunOptions) {
  const catalog = assistantCatalog();
  const wanted = provider && isProviderId(provider) ? provider : catalog.defaultProvider;
  if (!wanted) throw new Error('No assistant provider is configured');
  const meta = catalog.providers.find((p) => p.id === wanted);
  if (!meta?.available) {
    const spec = SPEC_BY_ID.get(wanted);
    throw new Error(`Provider ${wanted} is unavailable — ${spec?.configHint ?? 'check hub env'}`);
  }
  const resolvedModel = (typeof model === 'string' && model.trim()) || meta.defaultModel;
  if (!resolvedModel) {
    throw new Error(`Provider ${wanted} has no default model; pass an explicit model`);
  }
  const languageModel = await buildModel(wanted, resolvedModel);

  return streamText({
    model: languageModel,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: assistantTools,
    stopWhen: stepCountIs(maxSteps()),
  });
}
