import rateLimit from "express-rate-limit";

// Credential endpoints: slow down brute-force and reset-email spam.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
});

/* The kiosk's front door. It takes an admission number and no secret, which
   makes it the one route the roll could be walked from outside — and what it
   returns is a name and a wallet balance. The money stays behind the purchase
   code at checkout; this is what keeps enumeration slow enough to show up in
   the logs before it finishes.

   Thirty a minute: several kiosks sharing one school NAT at break time, each
   with a queue, and a student mistyping a digit or two. */
export const kioskSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a moment and try again." },
});

// Student lookup from the kiosk: generous enough for a busy counter,
// tight enough to make bulk scraping impractical.
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many searches. Please slow down." },
});
