import type { Device } from '@phone-remote/protocol';

/**
 * Resolve a label template against a list of devices.
 *
 * Placeholders:
 *   {i}   — 1-indexed counter (padded to match the highest index width)
 *   {n}   — 0-indexed counter (padded similarly)
 *   {model}        — device.model || serial
 *   {serial}       — full serial
 *   {serial-tail}  — serial with leading "10.x.y." network prefix stripped + ":5555" removed
 *   {label}        — current label, or device.model if no label set
 */
export function resolveBulkRename(opts: {
  serials: string[];
  template: string;
  devices: Device[];
  labels: Record<string, string>;
}): { serial: string; next: string }[] {
  const { serials, template, devices, labels } = opts;
  const bySerial = new Map(devices.map((d) => [d.serial, d]));
  const total = serials.length;
  const padTo = String(total).length;

  return serials.map((serial, idx) => {
    const device = bySerial.get(serial);
    const i = String(idx + 1).padStart(padTo, '0');
    const n = String(idx).padStart(padTo, '0');
    const model = device?.model || serial;
    const tail = serial.replace(/^\d+\.\d+\.\d+\./, '').replace(/:5555$/, '');
    const currentLabel = labels[serial] ?? device?.model ?? serial;

    const next = template
      .replace(/\{i\}/g, i)
      .replace(/\{n\}/g, n)
      .replace(/\{model\}/g, model)
      .replace(/\{serial-tail\}/g, tail)
      .replace(/\{serial\}/g, serial)
      .replace(/\{label\}/g, currentLabel);

    return { serial, next };
  });
}
