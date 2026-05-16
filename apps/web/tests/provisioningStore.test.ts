import { beforeEach, describe, expect, it } from 'vitest';

import { useProvisioningStore } from '../src/stores/provisioning';

beforeEach(() => {
  useProvisioningStore.setState({
    open: true,
    session: null,
    status: 'idle',
    error: null,
    tab: 'qr',
    qrAutoStarted: false,
    qrRetryAvailable: true,
    serial: null,
    pairIp: null,
    pairDraft: { ip: '', pairPort: '', pairCode: '', connectPort: '' },
    usbDraft: { ip: '', port: '5555' },
  });
});

describe('useProvisioningStore workflow state', () => {
  it('keeps tailnet sessions away from the QR tab', () => {
    useProvisioningStore.setState({
      session: {
        sessionId: 's1',
        authKey: 'tskey-auth',
        loginServer: 'https://headscale.test',
        qrPayload: 'WIFI:T:ADB;S:x;P:y;;',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      tab: 'tailnet',
    });

    useProvisioningStore.getState().setTab('qr');

    expect(useProvisioningStore.getState().tab).toBe('manual');
  });

  it('patches manual and USB form drafts in the store', () => {
    const store = useProvisioningStore.getState();
    store.patchPairDraft({ ip: '100.64.0.5', connectPort: '38831' });
    store.patchUsbDraft({ ip: '100.64.0.5' });

    expect(useProvisioningStore.getState().pairDraft).toMatchObject({
      ip: '100.64.0.5',
      connectPort: '38831',
    });
    expect(useProvisioningStore.getState().usbDraft).toEqual({
      ip: '100.64.0.5',
      port: '5555',
    });
  });

  it('resets wizard state on close', () => {
    useProvisioningStore.setState({
      tab: 'manual',
      qrAutoStarted: true,
      pairDraft: { ip: '100.64.0.5', pairPort: '12345', pairCode: '123456', connectPort: '5555' },
      usbDraft: { ip: '100.64.0.5', port: '5555' },
    });

    useProvisioningStore.getState().close();

    expect(useProvisioningStore.getState()).toMatchObject({
      open: false,
      tab: 'qr',
      qrAutoStarted: false,
      pairDraft: { ip: '', pairPort: '', pairCode: '', connectPort: '' },
      usbDraft: { ip: '', port: '5555' },
    });
  });
});
