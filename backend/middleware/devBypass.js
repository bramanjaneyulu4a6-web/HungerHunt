import Admin from '../models/Admin.js';
import Parent from '../models/Parent.js';

// Dev-only login bypass for the Ashok-work branch.
//
// Requires an explicit AUTH_BYPASS=true *and* a non-production NODE_ENV, so a
// flag left behind in a deployed environment still cannot disarm auth on its
// own. AUTH_BYPASS lives only in the gitignored .env files.
export const authBypassEnabled =
  process.env.AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

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
