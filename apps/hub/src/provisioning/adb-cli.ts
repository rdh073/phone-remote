/**
 * ADB CLI adapter. Wraps the `adb` binary in the AdbProvisioningPort
 * contract, with a circuit breaker so a failing local adb-server doesn't
 * keep getting hit on every request.
 *
 * Lives separately from `adapters.ts` because the CLI wrapper is the
 * heavy concrete adapter; `adapters.ts` should read as composition only.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { CircuitBreaker } from '../shared/circuit-breaker.js';
import type { AdbCommandResult, AdbProvisioningPort, Endpoint } from './types.js';

const run = promisify(execFile);

export class AdbCliProvisioningPort implements AdbProvisioningPort {
  constructor(
    private readonly adbPath: string,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  async pair(endpoint: Endpoint, code: string): Promise<void> {
    await this.run(['pair', at(endpoint), code], 30_000);
  }

  connect(endpoint: Endpoint): Promise<AdbCommandResult> {
    return this.run(['connect', at(endpoint)], 15_000);
  }

  async tcpip(serial: string, port: number): Promise<void> {
    await this.run(['-s', serial, 'tcpip', String(port)], 15_000);
  }

  private async run(args: string[], timeout: number): Promise<AdbCommandResult> {
    const result = await this.circuitBreaker.execute(() => run(this.adbPath, args, { timeout }));
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
    };
  }
}

function at(endpoint: Endpoint): string {
  return `${endpoint.ip}:${endpoint.port}`;
}
