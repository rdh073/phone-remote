import { z } from 'zod';

/**
 * Upstream failure when talking to Headscale (or any future tailnet provider).
 * Carries the upstream HTTP status when known so the route layer can decide
 * whether to surface it as 502 (bad gateway) or 503 (gateway unavailable).
 */
export class TailnetError extends Error {
  readonly upstreamStatus?: number;
  constructor(message: string, options?: { upstreamStatus?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'TailnetError';
    this.upstreamStatus = options?.upstreamStatus;
  }
}

const url = (): string => process.env.HEADSCALE_URL ?? '';
const apiKey = (): string | undefined => process.env.HEADSCALE_API_KEY;
const userId = (): number | undefined => {
  const v = process.env.HEADSCALE_USER_ID;
  return v ? Number(v) : undefined;
};

const PreAuthKey = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  key: z.string(),
  expiration: z.string().optional(),
  aclTags: z.array(z.string()).optional(),
}).passthrough();
export type PreAuthKey = z.infer<typeof PreAuthKey>;

const CreateResponse = z.object({ preAuthKey: PreAuthKey });
const NodeSummary = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  givenName: z.string().optional(),
  hostname: z.string().optional(),
  ipAddresses: z.array(z.string()).optional(),
  forcedTags: z.array(z.string()).optional(),
  validTags: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  location: z.string().optional(),
  region: z.string().optional(),
  site: z.string().optional(),
});
const NodeListResponse = z.object({ nodes: z.array(NodeSummary) });
export type TailnetNode = z.infer<typeof NodeSummary>;

export function isConfigured(): boolean {
  return Boolean(url() && apiKey());
}

export function getLoginServer(): string {
  return url();
}

export async function createAuthKey(opts: {
  tags?: string[];
  reusable?: boolean;
  ephemeral?: boolean;
  expirySec?: number;
}): Promise<PreAuthKey> {
  ensureConfigured();
  const body: Record<string, unknown> = {
    reusable: opts.reusable ?? false,
    ephemeral: opts.ephemeral ?? false,
    expiration: new Date(Date.now() + (opts.expirySec ?? 3600) * 1000).toISOString(),
    aclTags: opts.tags ?? [],
  };
  const uid = userId();
  if (uid !== undefined) body.user = uid;

  const res = await fetch(`${url()}/api/v1/preauthkey`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new TailnetError(`Headscale POST preauthkey ${res.status}: ${await res.text()}`, {
      upstreamStatus: res.status,
    });
  }
  return CreateResponse.parse(await res.json()).preAuthKey;
}

export async function expireAuthKey(id: string): Promise<void> {
  ensureConfigured();
  const res = await fetch(`${url()}/api/v1/preauthkey/expire`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ id: Number(id) }),
  });
  if (!res.ok) {
    throw new TailnetError(`Headscale expire ${res.status}: ${await res.text()}`, {
      upstreamStatus: res.status,
    });
  }
}

export async function deleteNode(id: string): Promise<void> {
  ensureConfigured();
  const res = await fetch(`${url()}/api/v1/node/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    throw new TailnetError(`Headscale delete node ${res.status}: ${await res.text()}`, {
      upstreamStatus: res.status,
    });
  }
}

export async function listNodes(): Promise<TailnetNode[]> {
  if (!isConfigured()) return [];
  const res = await fetch(`${url()}/api/v1/node`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) {
    throw new TailnetError(`Headscale list nodes ${res.status}: ${await res.text()}`, {
      upstreamStatus: res.status,
    });
  }
  const parsed = NodeListResponse.safeParse(await res.json());
  if (!parsed.success) {
    throw new TailnetError('Headscale list nodes returned an unexpected response shape');
  }
  return parsed.data.nodes;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  };
}

function ensureConfigured(): void {
  if (!isConfigured()) {
    throw new TailnetError('Headscale not configured: set HEADSCALE_URL and HEADSCALE_API_KEY');
  }
}
