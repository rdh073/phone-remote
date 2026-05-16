import { create } from 'zustand';

import { type PairRequest, type StartProvisionResponse } from '@phone-remote/protocol';
import {
  connectProvisionByIp,
  deleteProvisionSession,
  pairProvisionSession,
  pairProvisionSessionViaQr,
  startProvisionSession,
} from '../lib/api';

type Status = 'idle' | 'starting' | 'awaiting-pair' | 'pairing' | 'awaiting-connect-port' | 'done' | 'mdns-timeout' | 'error';
export type ProvisioningTab = 'tailnet' | 'qr' | 'manual' | 'usb';

type PairDraft = {
  ip: string;
  pairPort: string;
  pairCode: string;
  connectPort: string;
};

type UsbDraft = {
  ip: string;
  port: string;
};

const EMPTY_PAIR_DRAFT: PairDraft = {
  ip: '',
  pairPort: '',
  pairCode: '',
  connectPort: '',
};

const EMPTY_USB_DRAFT: UsbDraft = {
  ip: '',
  port: '5555',
};

type State = {
  open: boolean;
  session: StartProvisionResponse | null;
  status: Status;
  error: string | null;
  tab: ProvisioningTab;
  qrAutoStarted: boolean;
  // Whether the operator has a longer-budget retry available. Becomes false
  // after the second QR attempt times out — at that point only Pairing-code
  // is a reasonable next step.
  qrRetryAvailable: boolean;
  serial: string | null;
  pairIp: string | null;
  pairDraft: PairDraft;
  usbDraft: UsbDraft;
  setTab: (tab: ProvisioningTab) => void;
  markQrAutoStarted: () => void;
  setQrConnectPort: (connectPort: string) => void;
  patchPairDraft: (patch: Partial<PairDraft>) => void;
  patchUsbDraft: (patch: Partial<UsbDraft>) => void;
  start: () => Promise<void>;
  pair: (body: PairRequest) => Promise<void>;
  pairQr: (connectPort?: number) => Promise<void>;
  connect: (body: { ip: string; port: number }) => Promise<void>;
  cancel: () => Promise<void>;
  close: () => void;
};

export const useProvisioningStore = create<State>()((set, get) => ({
  open: false,
  session: null,
  status: 'idle',
  error: null,
  tab: 'qr',
  qrAutoStarted: false,
  qrRetryAvailable: true,
  serial: null,
  pairIp: null,
  pairDraft: EMPTY_PAIR_DRAFT,
  usbDraft: EMPTY_USB_DRAFT,

  setTab: (tab) => {
    const { session } = get();
    set({ tab: hasTailscaleStep(session) && tab === 'qr' ? 'manual' : tab });
  },
  markQrAutoStarted: () => set({ qrAutoStarted: true }),
  setQrConnectPort: (connectPort) =>
    set((state) => ({
      pairDraft: { ...state.pairDraft, connectPort },
    })),
  patchPairDraft: (patch) =>
    set((state) => ({
      pairDraft: { ...state.pairDraft, ...patch },
    })),
  patchUsbDraft: (patch) =>
    set((state) => ({
      usbDraft: { ...state.usbDraft, ...patch },
    })),

  start: async () => {
    set({
      open: true,
      status: 'starting',
      error: null,
      session: null,
      serial: null,
      pairIp: null,
      tab: 'qr',
      qrAutoStarted: false,
      qrRetryAvailable: true,
      pairDraft: EMPTY_PAIR_DRAFT,
      usbDraft: EMPTY_USB_DRAFT,
    });
    try {
      const session = await startProvisionSession();
      set({ session, status: 'awaiting-pair', tab: hasTailscaleStep(session) ? 'tailnet' : 'qr' });
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },

  pair: async (body) => {
    const { session } = get();
    if (!session) return;
    set({ status: 'pairing', error: null });
    try {
      const { serial } = await pairProvisionSession(session.sessionId, body);
      set({ status: 'done', serial });
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },

  pairQr: async (connectPort) => {
    const { session } = get();
    if (!session) return;
    set({ status: 'pairing', error: null, qrAutoStarted: true });
    try {
      const result = await pairProvisionSessionViaQr(session.sessionId, connectPort);
      if (result.kind === 'need-port') {
        set({ status: 'awaiting-connect-port', pairIp: result.pairIp, error: null });
        return;
      }
      if (result.kind === 'mdns-timeout') {
        set({ status: 'mdns-timeout', error: result.message, qrRetryAvailable: result.retryAvailable });
        return;
      }
      set({ status: 'done', serial: result.serial });
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },

  connect: async ({ ip, port }) => {
    // Session-less: the USB-tethered ADB-over-TCP path doesn't need the
    // provisioning session at all; we just `adb connect ip:port` once the
    // operator has run `adb tcpip <port>` from their laptop. The session
    // (if any) stays around but is unused — close() / cancel() still works.
    set({ status: 'pairing', error: null });
    try {
      const { serial } = await connectProvisionByIp(ip, port);
      set({ status: 'done', serial });
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
    }
  },

  cancel: async () => {
    const { session } = get();
    if (session) {
      await deleteProvisionSession(session.sessionId).catch(() => {});
    }
    set(resetState());
  },

  close: () => set(resetState()),
}));

function hasTailscaleStep(session: StartProvisionResponse | null): boolean {
  return Boolean(session?.authKey && session?.loginServer);
}

function resetState(): Partial<State> {
  return {
    open: false,
    session: null,
    status: 'idle',
    error: null,
    serial: null,
    pairIp: null,
    tab: 'qr',
    qrAutoStarted: false,
    qrRetryAvailable: true,
    pairDraft: EMPTY_PAIR_DRAFT,
    usbDraft: EMPTY_USB_DRAFT,
  };
}
