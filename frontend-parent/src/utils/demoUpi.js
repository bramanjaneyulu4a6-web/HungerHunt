export const DEMO_UPI_PROVIDERS = [
  {
    id: 'phonepe',
    name: 'PhonePe',
    mark: 'पे',
    color: '#5f259f',
    tint: '#f5effc',
  },
  {
    id: 'gpay',
    name: 'Google Pay',
    mark: 'G',
    color: '#1a73e8',
    tint: '#eef5ff',
  },
  {
    id: 'paytm',
    name: 'Paytm',
    mark: 'P',
    color: '#00baf2',
    tint: '#edfaff',
  },
];

/* The row where a parent types an address instead of picking an app. Shaped
   like a provider so the sheets, the mark tile and the stage screens can treat
   it as one more way to pay rather than a special case — but deliberately not
   part of DEMO_UPI_PROVIDERS, which is the list of apps we can name and put a
   logo to. Its colours are the app's own, since this row belongs to no brand. */
export const UPI_ID_METHOD = {
  id: 'upi-id',
  name: 'UPI ID',
  mark: '@',
  color: '#0f766e',
  tint: '#e6f5f2',
};

export const demoAmountProblem = (value) => {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 1 || amount > 20000) {
    return 'Enter a whole rupee amount between 1 and 20,000.';
  }
  return '';
};

export const makeUpiReference = (now = Date.now()) =>
  String(now).padStart(12, '0').slice(-12);

/* A parent's own UPI address, for the row where they type one instead of
 * picking an app. This is the copy that answers while they are still typing;
 * the server checks the same shape in backend/utils/upiVpa.js before spending
 * a PhonePe call on it, and that one is the authority. Keep the two patterns
 * in step — a client that is stricter than the server merely nags, but a
 * client that is looser sends payments that fail at the gateway. */
const VPA_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,254}[a-z0-9])?@[a-z][a-z0-9]{1,63}$/;

export const normalizeVpa = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const vpaProblem = (value) => {
  const vpa = normalizeVpa(value);
  if (!vpa) return 'Enter your UPI ID to continue.';
  if (!VPA_PATTERN.test(vpa)) {
    return 'That does not look like a UPI ID. Use the form name@bank, such as 9876543210@ybl.';
  }
  return '';
};
