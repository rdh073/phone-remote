import type { ReactNode } from 'react';
import type { Device } from '@phone-remote/protocol';

/**
 * Render a compact two-column preview of the devices about to be operated on,
 * for inclusion as the `body` of a confirm dialog. Caps the visible rows so the
 * dialog never grows unbounded; tail count is shown with `+ N more`.
 */
export function selectedPreview(
  serials: string[],
  devices: Device[],
  labels: Record<string, string>,
  opts?: { max?: number; intro?: string },
): ReactNode {
  const max = opts?.max ?? 12;
  const bySerial = new Map(devices.map((d) => [d.serial, d]));
  const head = serials.slice(0, max);
  const more = serials.length - head.length;

  return (
    <div className="space-y-2">
      {opts?.intro && <p>{opts.intro}</p>}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-zinc-300">
        {head.map((serial) => {
          const d = bySerial.get(serial);
          const label = labels[serial];
          const name = label || d?.model || serial;
          const tail = serial.replace(/^\d+\.\d+\.\d+\./, '').replace(/:5555$/, '');
          return (
            <li key={serial} className="flex items-baseline gap-1.5 truncate">
              <span className="text-zinc-600">·</span>
              <span className="truncate">{name}</span>
              {label && d?.model && (
                <span className="text-zinc-600 truncate">({d.model})</span>
              )}
              <span className="ml-auto text-zinc-600 shrink-0">{tail}</span>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="text-[11px] text-zinc-500 font-mono">+ {more} more</p>
      )}
    </div>
  );
}
