/**
 * Per-serial event bus for tap ripple visualization. Source tile fires a ripple
 * on every touch-down and re-fires it for every sync target so the operator can
 * see the fan-out land.
 */

type Listener = (x: number, y: number) => void;

const subscribers = new Map<string, Set<Listener>>();

export function subscribe(serial: string, fn: Listener): () => void {
  let set = subscribers.get(serial);
  if (!set) {
    set = new Set();
    subscribers.set(serial, set);
  }
  set.add(fn);
  return () => {
    const cur = subscribers.get(serial);
    if (!cur) return;
    cur.delete(fn);
    if (cur.size === 0) subscribers.delete(serial);
  };
}

export function notifyMany(serials: Iterable<string>, x: number, y: number): void {
  for (const serial of serials) {
    const set = subscribers.get(serial);
    if (!set) continue;
    for (const fn of set) fn(x, y);
  }
}
