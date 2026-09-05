export const ADMISSION_NUMBER_MIN_LENGTH = 4;
export const ADMISSION_NUMBER_MAX_LENGTH = 8;
export const ADMISSION_NUMBER_PATTERN = /^[A-Z0-9]{4,8}$/;
export const ADMISSION_NUMBER_MESSAGE =
  'Admission number must be 4 to 8 letters or numbers.';

// Admission numbers are identifiers, not quantities. Upper-casing gives the
// database one canonical representation and makes kiosk sign-in insensitive
// to how a student happens to type the letters.
export const normalizeAdmissionNumber = (value) =>
  String(value ?? '').trim().toUpperCase();

export const isValidAdmissionNumber = (value) =>
  ADMISSION_NUMBER_PATTERN.test(normalizeAdmissionNumber(value));
