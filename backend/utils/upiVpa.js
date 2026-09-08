/* A parent's own UPI address, for the collect flow where they type it rather
 * than pick an app. Nothing here trusts the string: it reaches PhonePe only
 * after matching the shape below, and reaches a receipt only masked.
 *
 * The pattern follows NPCI's addressing rules — a local part of up to 256
 * characters from a small alphabet, then a bank handle that is letters
 * followed by letters or digits. Deliberately no dots in the handle, which is
 * what separates "ashok@okhdfcbank" from the email address a parent types
 * into the field by mistake. */
const VPA_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,254}[a-z0-9])?@[a-z][a-z0-9]{1,63}$/;

export const normalizeVpa = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const isValidVpa = (value) => VPA_PATTERN.test(normalizeVpa(value));

/* What a receipt prints. Receipts get forwarded — to the office, into family
 * chats — so the address is shortened to the little that makes it
 * recognisable to the parent who paid, while the handle stays whole because
 * it is the half that says which app the money came from. */
export const maskVpa = (value) => {
  const vpa = normalizeVpa(value);
  if (!isValidVpa(vpa)) return '';

  const at = vpa.lastIndexOf('@');
  const local = vpa.slice(0, at);
  const keep = local.length > 3 ? 2 : 1;
  return `${local.slice(0, keep)}***${vpa.slice(at)}`;
};
