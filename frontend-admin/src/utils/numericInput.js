/* Fields the school records as digits and nothing else — admission numbers,
   phone numbers — where an accepted stray character is worse than a refused
   keystroke.
 *
 * The kiosk asks a student for five digits and nothing else, so an admission
 * number entered here as "ADM-1042" is a record that cannot log in, discovered
 * by a child standing at the till rather than by the office. That is the case
 * this file exists for.
 *
 * Deliberately not <input type="number">: it accepts e, E, +, - and ., shows
 * spinners that mean nothing on a phone number, and reports value as '' for
 * anything the browser judges invalid — so what the user typed becomes
 * unreadable to the very code trying to correct it. A text input filtered on
 * every change keeps the value honest and the correction visible.
 *
 * Admin-only on purpose. components/ui/index.jsx must stay byte-identical
 * across the four frontends, and only this one needs these fields today. */

/* Strips everything but digits, then truncates. An over-long paste keeps its
   leading digits rather than being rejected outright — a pasted
   "+91 98765 43210" is a phone number with a country code, and dropping the
   whole thing leaves an empty box explaining nothing. */
export const digitsOnly = (value, maxLength) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return maxLength ? digits.slice(0, maxLength) : digits;
};

/* Spread onto an <input> alongside its own value/onChange. `pattern` is the
   browser's own last check on submit, in case a value ever reaches the field
   without passing through digitsOnly — a browser autofill, say. */
export const numericFieldProps = (digits, autoComplete = 'off') => ({
  type: 'text',
  inputMode: 'numeric',
  pattern: `[0-9]{${digits}}`,
  maxLength: digits,
  autoComplete,
});
