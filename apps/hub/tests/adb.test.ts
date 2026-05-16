import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedGetDevices = vi.fn();
const mockedListNodes = vi.fn();

vi.mock('@yume-chan/adb', () => ({
  Adb: vi.fn(),
  AdbServerClient: vi.fn().mockImplementation(function () {
    return {
      getDevices: mockedGetDevices,
      createAdb: vi.fn(),
    };
  }),
}));

vi.mock('@yume-chan/adb-server-node-tcp', () => ({
  AdbServerNodeTcpConnector: vi.fn(),
}));

vi.mock('../src/tailnet.js', () => ({
  listNodes: mockedListNodes,
}));

describe('listDevices', () => {
  beforeEach(() => {
    vi.resetModules();
    mockedGetDevices.mockReset();
    mockedListNodes.mockReset();
  });

  afterEach(() => {
    mockedGetDevices.mockReset();
    mockedListNodes.mockReset();
  });

  it('enriches tcp devices with matching headscale metadata', async () => {
    mockedGetDevices.mockResolvedValue([
      { serial: '100.64.0.5:5555', state: 'device', model: 'Pixel 7' },
      { serial: 'usb-abc', state: 'offline', model: 'Pixel 6' },
    ]);
    mockedListNodes.mockResolvedValue([
      {
        id: '123',
        ipAddresses: ['100.64.0.5'],
        tags: ['tag:site-sg', 'customer:alpha', 'region:sea', 'site:sg-15'],
        name: 'sg-15-device',
        hostname: 'sg-15-device',
        givenName: 'sg-15-device',
        location: 'sg',
        region: 'sea',
        site: 'sg-15',
      },
    ]);

    const { listDevices } = await import('../src/adb.js');
    const devices = await listDevices();

    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      serial: '100.64.0.5:5555',
      state: 'device',
      source: 'tcp',
      model: 'Pixel 7',
      tailnet: {
        nodeId: '123',
        name: 'sg-15-device',
        hostname: 'sg-15-device',
      },
    });
    const firstDevice = devices[0]!;
    expect(firstDevice).toBeDefined();
    expect(devices[1]).toMatchObject({
      serial: 'usb-abc',
      source: 'usb',
      state: 'offline',
    });
    expect((firstDevice?.tailnet?.tags ?? [])).toEqual(
      expect.arrayContaining(['tag:site-sg', 'customer:alpha', 'region:sea', 'site:sg-15']),
    );
  });

  it('falls back to adb fields if headscale lookup fails', async () => {
    mockedGetDevices.mockResolvedValue([
      { serial: '100.64.0.7:5555', state: 'device', model: 'Galaxy' },
    ]);
    mockedListNodes.mockRejectedValue(new Error('headscale down'));

    const { listDevices } = await import('../src/adb.js');
    const devices = await listDevices();
    expect(devices).toEqual([
      {
        serial: '100.64.0.7:5555',
        state: 'device',
        source: 'tcp',
        model: 'Galaxy',
      },
    ]);
  });
});
