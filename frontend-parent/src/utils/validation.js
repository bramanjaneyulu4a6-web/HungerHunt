/* Mirrors backend/utils/validation.js. The server is what enforces these — this
   is so a parent finds out before a round trip, and gets told which field is
   wrong rather than being handed one message for the whole form. */

export const PASSWORD_MIN_LENGTH = 6;

export const passwordProblem = (password) => {
  if (!password) return 'Please enter a password.';

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  return null;
};

/* The number has to match what the school holds, character for character, so a
   country code or a space is not a formatting preference — it is the difference
   between finding the child's record and being told there isn't one. */
export const phoneProblem = (phone) => {
  if (!phone) return 'Please enter your phone number.';

  if (!/^\d{10}$/.test(phone.trim())) {
    return 'Enter the 10-digit number registered with the school, with no spaces or country code.';
  }

  return null;
};

export const emailProblem = (email) => {
  if (!email) return 'Please enter your email address.';
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email address.';

  return null;
};
