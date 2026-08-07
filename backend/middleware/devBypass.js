import Admin from '../models/Admin.js';
import Parent from '../models/Parent.js';

// Dev-only login bypass for the Ashok-work branch.
//
// Requires an explicit AUTH_BYPASS=true *and* NODE_ENV set to exactly
// 'development'. Testing for 'development' rather than "not production" is the
// point: any environment that forgets to set NODE_ENV, or sets it to 'prod',
// 'staging' or a typo, is not a development machine and does not get the
// bypass. AUTH_BYPASS lives only in the gitignored .env files.
export const authBypassEnabled =
  process.env.AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'development';

// Reaching production with the flag still set is a configuration accident. The
// line above already refuses to honour it, but failing the boot says so instead
// of leaving someone to infer it from the absence of a symptom.
if (process.env.AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_BYPASS must not be set in production');
}

// The bypass impersonates a real account rather than inventing an id, so
// ownership checks, populated queries and per-parent scoping behave exactly as
// they do behind a genuine token. Resolved once, then cached for the process.
let cachedAdminId;
let cachedParent;

export const resolveBypassAdmin = async () => {
  if (!cachedAdminId) {
    const admin = await Admin.findOne().sort({ createdAt: 1 }).select('_id');
    cachedAdminId = admin?._id;
  }

  return cachedAdminId;
};

export const resolveBypassParent = async () => {
  if (!cachedParent) {
    const parent = await Parent.findOne().sort({ createdAt: 1 }).select('_id phone');
    if (parent) cachedParent = { id: parent._id, phone: parent.phone };
  }

  return cachedParent;
};
