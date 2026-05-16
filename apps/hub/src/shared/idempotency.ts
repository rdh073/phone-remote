export class IdempotencyConflictError extends Error {
  constructor(message = 'operation already in progress') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

type InFlight<V> = {
  fingerprint: string;
  promise: Promise<V>;
};

export class IdempotencyGate<K, V> {
  private readonly inFlight = new Map<K, InFlight<V>>();

  run(key: K, fingerprint: string, task: () => Promise<V>): Promise<V> {
    const existing = this.inFlight.get(key);
    if (existing) {
      if (existing.fingerprint === fingerprint) return existing.promise;
      throw new IdempotencyConflictError();
    }

    const promise = task().finally(() => {
      if (this.inFlight.get(key)?.promise === promise) {
        this.inFlight.delete(key);
      }
    });
    this.inFlight.set(key, { fingerprint, promise });
    return promise;
  }
}

export function stableFingerprint(value: unknown): string {
  return JSON.stringify(sortForFingerprint(value));
}

function sortForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForFingerprint);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortForFingerprint(v)]),
  );
}
