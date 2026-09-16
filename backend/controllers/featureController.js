import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import FeatureVisibility from '../models/FeatureVisibility.js';
import {
  DEFAULT_HIDDEN,
  FEATURES,
  SETTABLE_ROLES,
  effectiveHidden,
  hiddenListProblem,
  overridesProblem,
} from '../utils/featureCatalogue.js';

/* The super admin's control panel: what the console can hide, what each role
   hides today, and every account with an exception of its own. All three
   endpoints sit behind requireSuperAdmin on the route. */

// The stored list, as the object the catalogue arithmetic and the panel use.
export const overridesOf = (account) => {
  const raw = account?.featureOverrides;
  if (!Array.isArray(raw)) return {};
  return Object.fromEntries(
    raw.filter((entry) => entry?.key && (entry.value === 'hidden' || entry.value === 'shown'))
      .map((entry) => [entry.key, entry.value]),
  );
};

const toStored = (overrides) => Object.entries(overrides).map(([key, value]) => ({ key, value }));

const roleSettings = async () => {
  const rows = await FeatureVisibility.find({ role: { $in: SETTABLE_ROLES } }).lean();
  return Object.fromEntries(SETTABLE_ROLES.map((role) => {
    const row = rows.find((candidate) => candidate.role === role);
    return [role, { hidden: row ? row.hidden : DEFAULT_HIDDEN[role] ?? [], stored: Boolean(row) }];
  }));
};

const accountView = (account) => ({
  id: String(account._id),
  name: account.name,
  email: account.email || '',
  phone: account.phone,
  role: account.role || 'admin',
  isSuperAdmin: (account.role || 'admin') === 'admin' && account.isSuperAdmin === true,
  active: account.active !== false,
  overrides: overridesOf(account),
});

export const getFeatureSettings = async (req, res) => {
  const [roles, accounts] = await Promise.all([
    roleSettings(),
    Admin.find({ active: { $ne: false } }, 'name email phone role isSuperAdmin active featureOverrides')
      .sort({ role: 1, name: 1 }).lean(),
  ]);
  res.json({
    features: FEATURES,
    defaults: DEFAULT_HIDDEN,
    roles,
    accounts: accounts.map(accountView),
  });
};

export const setRoleFeatures = async (req, res) => {
  const role = String(req.params.role || '');
  if (!SETTABLE_ROLES.includes(role)) return res.status(404).json({ message: 'Unknown role.' });
  const problem = hiddenListProblem(req.body?.hidden);
  if (problem) return res.status(400).json({ message: problem });
  const hidden = [...new Set(req.body.hidden.map(String))];
  const row = await FeatureVisibility.findOneAndUpdate(
    { role },
    { $set: { hidden, updatedBy: req.staff.id } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  res.json({ message: `Feature visibility for ${role} accounts saved.`, role, hidden: row.hidden });
};

export const setAccountFeatures = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Staff account not found.' });
  }
  const account = await Admin.findById(req.params.id);
  if (!account) return res.status(404).json({ message: 'Staff account not found.' });
  const problem = overridesProblem(req.body?.overrides);
  if (problem) return res.status(400).json({ message: problem });

  // Merge rather than replace, so the panel can send one change at a time;
  // null clears an exception back to the role's setting.
  const next = overridesOf(account);
  for (const [key, value] of Object.entries(req.body.overrides)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  account.featureOverrides = toStored(next);
  await account.save();
  const row = await FeatureVisibility.findOne({ role: account.role || 'admin' }).lean();
  res.json({
    message: `Feature visibility for ${account.name} saved.`,
    account: accountView(account),
    hiddenFeatures: effectiveHidden({
      role: account.role || 'admin',
      isSuperAdmin: account.isSuperAdmin === true,
      roleHidden: row ? row.hidden : null,
      overrides: next,
    }),
  });
};
