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
