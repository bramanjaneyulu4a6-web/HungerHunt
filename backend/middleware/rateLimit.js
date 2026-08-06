import rateLimit from "express-rate-limit";

// Credential endpoints: slow down brute-force and reset-email spam.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in a few minutes." },
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
