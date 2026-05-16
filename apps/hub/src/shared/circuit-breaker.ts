export class CircuitOpenError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date) {
    super(`circuit open until ${retryAt.toISOString()}`);
    this.name = 'CircuitOpenError';
    this.retryAt = retryAt;
  }
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
}

export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    const now = this.now();
    if (this.openUntil > now) {
      throw new CircuitOpenError(new Date(this.openUntil));
    }

    try {
      const result = await task();
      this.failures = 0;
      this.openUntil = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.options.failureThreshold) {
        this.openUntil = now + this.options.cooldownMs;
      }
      throw err;
    }
  }
}
