import { z } from 'zod';

export const Device = z.object({
  serial: z.string(),
  state: z.enum(['device', 'offline', 'unauthorized']),
  source: z.enum(['usb', 'tcp']),
  model: z.string().optional(),
  androidVersion: z.string().optional(),
  tailnet: z
    .object({
      nodeId: z.string().optional(),
      name: z.string().optional(),
      hostname: z.string().optional(),
      givenName: z.string().optional(),
      ipAddresses: z.array(z.string()).optional(),
      location: z.string().optional(),
      region: z.string().optional(),
      site: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .partial()
    .optional(),
});
export type Device = z.infer<typeof Device>;

export const TouchAction = z.enum(['down', 'up', 'move']);
export type TouchAction = z.infer<typeof TouchAction>;

export const ClientMessage = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('touch'),
    action: TouchAction,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    pointerId: z.number().int().default(0),
    pressure: z.number().min(0).max(1).default(1),
    actionButton: z.number().int().min(0).default(0),
    buttons: z.number().int().min(0).default(0),
  }),
  z.object({
    kind: z.literal('key'),
    keyCode: z.number().int().min(0),
    action: z.enum(['down', 'up']),
  }),
  z.object({
    kind: z.literal('text'),
    text: z.string(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('video-meta'),
    codec: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  z.object({
    kind: z.literal('error'),
    message: z.string(),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export const StartProvisionResponse = z.object({
  sessionId: z.string(),
  authKey: z.string().nullable(),
  loginServer: z.string().nullable(),
  qrPayload: z.string(),
  expiresAt: z.string(),
});
export type StartProvisionResponse = z.infer<typeof StartProvisionResponse>;

export const LoginBodySchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

/**
 * Hub capabilities detected at boot. Once probed, immutable for the process
 * lifetime. The frontend uses these to hide paths the hub structurally can't
 * support (e.g. QR/mDNS pairing when the multicast socket can't bind).
 */
export type HubCapabilities = {
  /** Whether mDNS multicast is reachable from the hub host (bonjour bind succeeded). */
  mdns: boolean;
  /** Whether a tailnet provider (currently Headscale) is configured and reachable. */
  tailnet: boolean;
};

export type HealthResponse = {
  ok: boolean;
  /** @deprecated read `capabilities.tailnet` instead. Kept for backward compat. */
  tailnet?: boolean;
  capabilities: HubCapabilities;
};

export type AuthMeResponse = { user: string };
export type LoginResponse = { user: string };

export const DeviceKeyBodySchema = z.object({
  keyCode: z.number().int(),
});
export type DeviceKeyBody = z.infer<typeof DeviceKeyBodySchema>;

export const DeviceShellBodySchema = z.object({
  command: z.string().min(1),
});
export type DeviceShellBody = z.infer<typeof DeviceShellBodySchema>;

export const ProviderIdSchema = z.enum([
  'claude-code',
  'anthropic-api',
  'openai',
  'google',
  'deepseek',
  'ollama',
  'openai-compatible',
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export const PROVIDER_IDS = ProviderIdSchema.options;

export const AssistantChatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  provider: ProviderIdSchema.optional(),
  model: z.string().optional(),
});
export type AssistantChatBody = z.infer<typeof AssistantChatBodySchema>;

export const QrPairBodySchema = z.object({
  connectPort: z.number().int().min(1).max(65535).optional(),
});
export type QrPairBody = z.infer<typeof QrPairBodySchema>;

export type PairResponse = {
  serial: string;
};

export const SettingsPatchBodySchema = z.object({
  patch: z.record(z.string(), z.union([z.string(), z.null()])),
});
export type SettingsPatchBody = z.infer<typeof SettingsPatchBodySchema>;

export const ProvisionConnectBodySchema = z.object({
  ip: z.ipv4(),
  port: z.number().int().min(1).max(65535).default(5555),
});
export type ProvisionConnectBody = z.infer<typeof ProvisionConnectBodySchema>;

export const PairRequest = z.object({
  ip: z.ipv4(),
  pairPort: z.number().int().min(1).max(65535),
  pairCode: z.string().regex(/^\d{6}$/),
  connectPort: z.number().int().min(1).max(65535),
});
export type PairRequest = z.infer<typeof PairRequest>;

export const QrProvisionNeedPortSchema = z.object({
  kind: z.literal('need-port'),
  pairIp: z.string(),
});
export type QrProvisionNeedPort = z.infer<typeof QrProvisionNeedPortSchema>;

export const QrProvisionDoneSchema = z.object({
  kind: z.literal('done'),
  serial: z.string(),
});
export type QrProvisionDone = z.infer<typeof QrProvisionDoneSchema>;

export const QrProvisionMdnsTimeoutSchema = z.object({
  kind: z.literal('mdns-timeout'),
  message: z.string(),
  retryAvailable: z.boolean(),
});
export type QrProvisionMdnsTimeout = z.infer<typeof QrProvisionMdnsTimeoutSchema>;

export type QrProvisionResult = QrProvisionNeedPort | QrProvisionDone | QrProvisionMdnsTimeout;

export type DisconnectResult = {
  disconnected: boolean;
  tailnetRemoved: boolean;
};
