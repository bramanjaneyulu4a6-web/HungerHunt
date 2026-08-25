/* The one place rupees and paise meet. Payment code is paise-native (PhonePe
 * transacts in integer paise); the existing wallet ledgers are rupee floats.
 * Every crossing goes through these two functions so a missed *100 or /100
 * can only ever be a bug in one file. */

export const rupeesToPaise = (rupees) => {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`Not a usable rupee amount: ${rupees}`);
  }
  const paise = Math.round(rupees * 100);
  // Refuse sub-paisa amounts rather than silently rounding a price that
  // should not exist (1.005 is a data bug, not a rounding job).
  if (Math.abs(paise - rupees * 100) > 1e-6) {
    throw new Error(`More than two decimal places: ${rupees}`);
  }
  return paise;
};

export const paiseToRupees = (paise) => {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new Error(`Not a usable paise amount: ${paise}`);
  }
  return paise / 100;
};
