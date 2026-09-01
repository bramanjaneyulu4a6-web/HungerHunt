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

export const demoAmountProblem = (value) => {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 1 || amount > 20000) {
    return 'Enter a whole rupee amount between 1 and 20,000.';
  }
  return '';
};

export const makeUpiReference = (now = Date.now()) =>
  String(now).padStart(12, '0').slice(-12);
