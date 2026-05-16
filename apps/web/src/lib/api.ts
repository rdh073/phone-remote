import {
  type AuthMeResponse,
  type Device,
  type DeviceKeyBody,
  type DeviceShellBody,
  type DisconnectResult,
  type HealthResponse,
  type LoginResponse,
  type PairRequest,
  type PairResponse,
  type ProvisionConnectBody,
  type QrProvisionDone,
  type QrProvisionMdnsTimeout,
  type QrProvisionNeedPort,
  type QrProvisionResult,
  type StartProvisionResponse,
} from '@phone-remote/protocol';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}${body ? `: ${body}` : ''}`);
    this.name = 'ApiError';
  }
}

async function parseBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new Error(`Expected JSON response but received an empty body`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 120)}`);
  }
}

async function checkResponse(response: Response, allowedStatuses: number[] = [200]): Promise<Response> {
  if (!allowedStatuses.includes(response.status)) {
    const body = await parseBodyText(response);
    throw new ApiError(response.status, body);
  }
  return response;
}

export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await checkResponse(await fetch(url, init));
  return parseJson<T>(response);
}

export async function requestResponse(
  url: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [200],
): Promise<Response> {
  return checkResponse(await fetch(url, init), allowedStatuses);
}

export function getHealth(): Promise<HealthResponse> {
  return requestJson('/health');
}

export function getAuthMe(): Promise<AuthMeResponse> {
  return requestJson<AuthMeResponse>('/api/auth/me');
}

export async function postAuthLogin(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const body = await parseBodyText(response);
    throw new ApiError(response.status, body);
  }
  return parseJson<LoginResponse>(response);
}

export async function postAuthLogout(): Promise<void> {
  await requestResponse('/api/auth/logout', { method: 'POST' }, [200]);
}

export function listDevices(): Promise<{ devices: Device[] }> {
  return requestJson('/devices');
}

export function startProvisionSession(): Promise<StartProvisionResponse> {
  return requestJson('/api/provision/start', { method: 'POST' });
}

export async function pairProvisionSession(
  sessionId: string,
  body: PairRequest,
): Promise<PairResponse> {
  return requestJson(`/api/provision/${encodeURIComponent(sessionId)}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function pairProvisionSessionViaQr(
  sessionId: string,
  connectPort?: number,
): Promise<QrProvisionResult> {
  const response = await requestResponse(
    `/api/provision/${encodeURIComponent(sessionId)}/qr-pair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connectPort ? { connectPort } : {}),
    },
    [200, 409, 422],
  );

  if (response.status === 409) {
    return parseJson<QrProvisionNeedPort>(response);
  }
  if (response.status === 422) {
    return parseJson<QrProvisionMdnsTimeout>(response);
  }

  return parseJson<QrProvisionDone>(response);
}

export async function deleteProvisionSession(sessionId: string): Promise<void> {
  await requestResponse(`/api/provision/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }, [200]);
}

export async function connectProvisionByIp(
  ip: string,
  port: number,
): Promise<PairResponse> {
  const body: ProvisionConnectBody = { ip, port };
  return requestJson('/api/provision/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export type ServerSettingCategory = 'providers' | 'assistant' | 'video' | 'hub';
export type ServerSettingType = 'text' | 'password' | 'number' | 'boolean';

export interface ServerSettingMeta {
  key: string;
  label: string;
  description: string;
  category: ServerSettingCategory;
  type: ServerSettingType;
  secret?: boolean;
  placeholder?: string;
  restartRequired?: boolean;
  /** Closed-set values. When present, render as a dropdown instead of a text input. */
  options?: { value: string; label?: string }[];
}

export interface ServerSettingValue {
  key: string;
  value: string | null;
  defined: boolean;
  secret: boolean;
  preview?: string;
}

export interface ServerSettingsResponse {
  categories: { id: ServerSettingCategory; label: string; hint: string }[];
  keys: ServerSettingMeta[];
  values: ServerSettingValue[];
}

export interface ServerSettingsPatchResult {
  applied: string[];
  removed: string[];
  /** Subset of touched keys whose `restartRequired` flag is set — they were
   *  written to .env.local but won't take effect until the hub restarts. */
  restartPending: string[];
  values: ServerSettingValue[];
}

export function getServerSettings(): Promise<ServerSettingsResponse> {
  return requestJson('/api/settings');
}

export function patchServerSettings(
  patch: Record<string, string | null>,
): Promise<ServerSettingsPatchResult> {
  return requestJson('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  });
}

export async function sendDeviceKey(serial: string, keyCode: number): Promise<void> {
  const payload: DeviceKeyBody = { keyCode };
  await requestResponse(`/api/dev/${encodeURIComponent(serial)}/key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function rebootDevice(serial: string): Promise<void> {
  await requestResponse(`/api/dev/${encodeURIComponent(serial)}/reboot`, { method: 'POST' });
}

export async function disconnectDevice(serial: string): Promise<DisconnectResult> {
  return requestJson(`/api/dev/${encodeURIComponent(serial)}`, { method: 'DELETE' });
}

export async function runShell(serial: string, command: string): Promise<string> {
  const body: DeviceShellBody = { command };
  const response = await requestJson<{ output: string }>(`/api/dev/${encodeURIComponent(serial)}/shell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.output;
}

export async function getDeviceScreenshot(serial: string): Promise<Blob> {
  const response = await requestResponse(`/api/dev/${encodeURIComponent(serial)}/screenshot`, {}, [200]);
  return response.blob();
}
