const DECIMAL_MONEY = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

export class MoneyValidationError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'MoneyValidationError';
  }
}

/** Convert a rupee input to integer paise without floating-point arithmetic. */
export const rupeesToPaise = (value, { allowNegative = false } = {}) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new MoneyValidationError('Money must be a decimal string or number.');
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new MoneyValidationError('Money must be finite.');
  }

  const normalized = String(value).trim();
  const match = DECIMAL_MONEY.exec(normalized);
  if (!match) {
    throw new MoneyValidationError('Money must have no more than two decimal places.');
  }

  const [, sign, whole, fraction = ''] = match;
  if (sign === '-' && !allowNegative) {
    throw new MoneyValidationError('Money cannot be negative.');
  }

  const magnitude = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(magnitude)) {
    throw new MoneyValidationError('Money is outside the safe integer range.');
  }

  return sign === '-' ? -magnitude : magnitude;
};

export const assertPaise = (value, { allowNegative = false } = {}) => {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyValidationError('Paise must be a safe integer.');
  }
  if (!allowNegative && value < 0) {
    throw new MoneyValidationError('Paise cannot be negative.');
  }
  return value;
};

/** Compatibility helper for legacy APIs that still expose rupee numbers. */
export const paiseToRupees = (value, options) =>
  assertPaise(value, options) / 100;

export const sumPaise = (values, options) => values.reduce(
  (total, value) => {
    const next = total + assertPaise(value, options);
    if (!Number.isSafeInteger(next)) {
      throw new MoneyValidationError('Money total is outside the safe integer range.');
    }
    return next;
  },
  0
);

