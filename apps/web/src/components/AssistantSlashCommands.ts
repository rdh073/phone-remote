/**
 * Slash commands for the operator assistant. Two flavours:
 *  - `local: true` — handled in the UI (no message sent to the LLM).
 *  - default      — `prompt` is sent as a user message, optionally with args.
 *
 * Mirrors cliper's slashCommands.ts shape so the palette UX stays familiar.
 */
export interface SlashCommand {
  command: string;
  description: string;
  /** Inserted verbatim into the composer. Args / @-mentions follow on the same line. */
  prompt: string;
  /** True for UI-only commands like /clear that don't talk to the LLM. */
  local?: boolean;
  /**
   * True when the command operates on a device — the composer will auto-append
   * `@<serial>` for every currently-selected grid device so the operator only
   * needs to press Enter to send.
   */
  needsTarget?: boolean;
}

export interface SlashCommandMatch {
  command: SlashCommand;
  args: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/clear', description: 'Reset the chat (UI only)', prompt: '', local: true },
  {
    command: '/help',
    description: 'List available tools with a one-line example each',
    prompt: 'What tools do you have? Give a one-line example for each.',
  },
  {
    command: '/devices',
    description: 'List the fleet',
    prompt: 'List every device with state, source, model, and tailnet IP.',
  },
  {
    command: '/screenshot',
    description: 'Take a screenshot of',
    prompt: 'Screenshot',
    needsTarget: true,
  },
  { command: '/home', description: 'Press HOME on', prompt: 'Press HOME (keyCode 3) on', needsTarget: true },
  { command: '/back', description: 'Press BACK on', prompt: 'Press BACK (keyCode 4) on', needsTarget: true },
  { command: '/menu', description: 'Press MENU on', prompt: 'Press MENU (keyCode 82) on', needsTarget: true },
  { command: '/power', description: 'Press POWER on', prompt: 'Press POWER (keyCode 26) on', needsTarget: true },
  {
    command: '/shell',
    description: 'Run an `adb shell` command on',
    prompt: 'Run this shell command on',
    needsTarget: true,
  },
  {
    command: '/reboot',
    description: 'Reboot — destructive',
    prompt: 'Reboot',
    needsTarget: true,
  },
];

export function parseSlashCommand(
  input: string,
  commands: SlashCommand[] = SLASH_COMMANDS,
): SlashCommandMatch | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = /^\/?([^\s]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return null;

  const token = normalizeCommandToken(match[1] ?? '');
  const command = commands.find((c) => normalizeCommandToken(c.command) === token);
  if (!command) return null;

  return { command, args: (match[2] ?? '').trim() };
}

export function filterSlashCommands(
  input: string,
  commands: SlashCommand[] = SLASH_COMMANDS,
): SlashCommand[] {
  const query = input.trim().toLowerCase();
  if (!query) return commands;

  const direct = parseSlashCommand(input, commands);
  if (direct) return [direct.command];

  const head = query.split(/\s+/, 1)[0] ?? '';
  return commands.filter(
    (c) =>
      c.command.toLowerCase().includes(head) ||
      c.description.toLowerCase().includes(query),
  );
}

/**
 * Compose the final message sent to the LLM from a picked command + args.
 * Args (if any) are appended after a blank line to keep the prompt readable.
 */
export function composeSlashPrompt(command: SlashCommand, args: string): string {
  const trimmed = args.trim();
  if (!trimmed) return command.prompt;
  return `${command.prompt}\n\n${trimmed}`;
}

function normalizeCommandToken(token: string): string {
  return token.replace(/^\/+/, '').toLowerCase();
}
