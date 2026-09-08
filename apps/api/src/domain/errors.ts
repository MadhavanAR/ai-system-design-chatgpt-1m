export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MODEL_TIMEOUT'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'MODEL_UNAVAILABLE'
  | 'CIRCUIT_OPEN'
  | 'CLIENT_DISCONNECTED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    retryable: boolean = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, false, details);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(
    message: string,
    retryAfterSeconds: number = 60,
    details?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, details);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ModelTimeoutError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MODEL_TIMEOUT', 504, true, details);
  }
}

export class ModelUnavailableError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MODEL_UNAVAILABLE', 503, true, details);
  }
}

export class CircuitOpenError extends AppError {
  constructor(serviceName: string) {
    super(
      `Circuit breaker is OPEN for [${serviceName}]. Upstream service degraded.`,
      'CIRCUIT_OPEN',
      503,
      true,
      { service: serviceName }
    );
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(dependency: string, message: string) {
    super(
      `Required infrastructure dependency [${dependency}] is unavailable: ${message}`,
      'DEPENDENCY_UNAVAILABLE',
      503,
      true,
      { dependency }
    );
  }
}
