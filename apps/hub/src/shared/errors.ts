export type ErrorResponseBody = Record<string, unknown>;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly body: ErrorResponseBody;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { body?: ErrorResponseBody; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = options.expose ?? statusCode < 500;
    this.body = options.body ?? { error: code, message };
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const stderr = (err as { stderr?: string }).stderr;
    return stderr ? `${err.message}: ${stderr.trim()}` : err.message;
  }
  return String(err);
}
