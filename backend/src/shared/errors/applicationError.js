export class ApplicationError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApplicationError {
  constructor(details) {
    super('Request validation failed.', {
      status: 400,
      code: 'VALIDATION_ERROR',
      details,
    });
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource) {
    super(`${resource} not found.`, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends ApplicationError {
  constructor(message, details) {
    super(message, { status: 409, code: 'STATE_CONFLICT', details });
  }
}

