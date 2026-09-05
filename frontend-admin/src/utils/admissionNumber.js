export const ADMISSION_NUMBER_MIN_LENGTH = 4;
export const ADMISSION_NUMBER_MAX_LENGTH = 8;
export const ADMISSION_NUMBER_PATTERN = '[A-Za-z0-9]{4,8}';
export const ADMISSION_NUMBER_HELP = 'Use 4 to 8 letters or numbers.';

export const normalizeAdmissionNumber = (value) =>
  String(value ?? '').trim().toUpperCase();

export const sanitizeAdmissionNumberInput = (value) =>
  normalizeAdmissionNumber(value)
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ADMISSION_NUMBER_MAX_LENGTH);

export const admissionNumberFieldProps = {
  type: 'text',
  inputMode: 'text',
  pattern: ADMISSION_NUMBER_PATTERN,
  minLength: ADMISSION_NUMBER_MIN_LENGTH,
  maxLength: ADMISSION_NUMBER_MAX_LENGTH,
  autoCapitalize: 'characters',
  autoComplete: 'off',
};
