import type { FastifyInstance } from 'fastify';

import { AppError } from './errors.js';
import { CircuitOpenError } from './circuit-breaker.js';
import { IdempotencyConflictError } from './idempotency.js';
import { InvariantViolationError } from './invariant.js';

type FastifyErrorLike = Error & {
  statusCode?: number;
  code?: string;
  validation?: unknown;
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyErrorLike, request, reply) => {
    const response = toHttpError(error);
    const log = response.statusCode >= 500 ? request.log.error.bind(request.log) : request.log.warn.bind(request.log);
    log({ err: error, statusCode: response.statusCode, code: response.code }, 'request failed');
    reply.code(response.statusCode).send(response.body);
  });
}

export function toHttpError(error: FastifyErrorLike): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof CircuitOpenError) {
    return new AppError(503, 'circuit_open', 'dependency temporarily unavailable', {
      body: {
        error: 'circuit_open',
        message: 'dependency temporarily unavailable',
        retryAt: error.retryAt.toISOString(),
      },
      cause: error,
    });
  }

  if (error instanceof IdempotencyConflictError) {
    return new AppError(409, 'operation_in_progress', error.message, { cause: error });
  }

  if (error instanceof InvariantViolationError) {
    return new AppError(500, 'invariant_violation', 'internal invariant violation', {
      expose: false,
      cause: error,
    });
  }

  const statusCode = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
  const code = typeof error.code === 'string' ? error.code : statusCode >= 500 ? 'internal_error' : 'request_error';
  const message = statusCode >= 500 ? 'internal server error' : error.message;
  return new AppError(statusCode, code, message, { expose: statusCode < 500, cause: error });
}
