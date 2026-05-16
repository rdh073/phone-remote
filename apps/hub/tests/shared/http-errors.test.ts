import { describe, expect, it } from 'vitest';

import { CircuitOpenError } from '../../src/shared/circuit-breaker.js';
import { AppError } from '../../src/shared/errors.js';
import { toHttpError } from '../../src/shared/http-errors.js';
import { IdempotencyConflictError } from '../../src/shared/idempotency.js';
import { InvariantViolationError } from '../../src/shared/invariant.js';

describe('toHttpError', () => {
  it('passes AppError through unchanged', () => {
    const err = new AppError(422, 'invalid_patch', 'invalid patch');
    expect(toHttpError(err)).toBe(err);
  });

  it('maps circuit-open errors to a retryable 503 response', () => {
    const mapped = toHttpError(new CircuitOpenError(new Date('2026-05-16T00:00:00.000Z')));
    expect(mapped.statusCode).toBe(503);
    expect(mapped.body).toEqual({
      error: 'circuit_open',
      message: 'dependency temporarily unavailable',
      retryAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('maps idempotency conflicts to 409', () => {
    const mapped = toHttpError(new IdempotencyConflictError());
    expect(mapped.statusCode).toBe(409);
    expect(mapped.body).toMatchObject({ error: 'operation_in_progress' });
  });

  it('does not expose invariant details', () => {
    const mapped = toHttpError(new InvariantViolationError('paired session is missing serial'));
    expect(mapped.statusCode).toBe(500);
    expect(mapped.body).toEqual({
      error: 'invariant_violation',
      message: 'internal invariant violation',
    });
  });

  it('normalizes unclassified errors to a generic 500', () => {
    const mapped = toHttpError(new Error('secret dependency detail'));
    expect(mapped.statusCode).toBe(500);
    expect(mapped.body).toEqual({
      error: 'internal_error',
      message: 'internal server error',
    });
  });
});
