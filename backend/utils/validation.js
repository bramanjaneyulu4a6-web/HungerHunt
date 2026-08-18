/* Rules the account forms are held to, in one place so the two ends of a flow
   cannot disagree. Registration accepted any password at all — including none,
   which reached bcrypt.hash(undefined) and came back as a 500 — while the reset
   that replaces the very same password demanded six characters. */

export const PASSWORD_MIN_LENGTH = 6;

export const passwordProblem = (password) => {
  if (!password) return "Password is required.";

  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  return null;
};

/* The code a student types at the counter is four digits, and is kept apart
   from passwordProblem above on purpose — they guard different things, and the
   day one of them changes is not the day the other should.
 *
 * It is entered on a touch screen, by a child, with a queue behind them, and it
 * is only ever compared against a hash. Four digits is what that situation can
 * carry; the wallet limit and the parent's approval are what actually bound
 * what it can spend. Digits rather than characters so the till can put a number
 * pad under it and there is no shift key to fumble. */
export const PURCHASE_CODE_LENGTH = 4;

const FOUR_DIGITS = /^\d{4}$/;

export const purchaseCodeProblem = (code) => {
  if (code === undefined || code === null || code === "") {
    return "A purchase code is required.";
  }

  if (!FOUR_DIGITS.test(String(code))) {
    return `The purchase code must be ${PURCHASE_CODE_LENGTH} digits.`;
  }

  return null;
};

/* A parent is matched to their children by comparing this against the number
   the school holds, character for character. So the useful check is not which
   numbers exist but which ones can possibly match: a country code, a space or a
   dash means "no matching student found", which reads as the school having no
   record of the child rather than as a fixable typo. */
const TEN_DIGITS = /^\d{10}$/;

export const phoneProblem = (phone) => {
  if (!phone) return "Phone number is required.";

  if (!TEN_DIGITS.test(String(phone).trim())) {
    return "Enter the 10-digit phone number registered with the school, with no spaces or country code.";
  }

  return null;
};

export const emailProblem = (email) => {
  if (!email) return "Email is required.";

  // Deliberately loose: the address has to survive being sent a reset link, and
  // anything stricter rejects valid addresses for no gain.
  if (!/^\S+@\S+\.\S+$/.test(String(email).trim())) {
    return "Enter a valid email address.";
  }

  return null;
};
