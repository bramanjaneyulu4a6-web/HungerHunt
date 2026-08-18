import crypto from "crypto";

export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

// The raw token goes in the email; only its hash is stored, so a leaked
// database row cannot be replayed as a reset link.
export const createResetToken = () => {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hashed: hashResetToken(raw) };
};

export const hashResetToken = (raw) =>
  crypto.createHash("sha256").update(raw).digest("hex");
