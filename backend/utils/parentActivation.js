import OrderingSettings from '../models/OrderingSettings.js';
import Parent from '../models/Parent.js';

/* A parent who can sign in: not archived, past first-password setup, and
   holding a password. The same three things parentController's login checks,
   so "activated" means one thing to the office's Students filter, the kiosk
   door and the sign-in itself. activationRequired absent reads as activated —
   accounts older than that field were password accounts already in use. */
export const ACTIVATED_PARENT = {
  active: { $ne: false },
  activationRequired: { $ne: true },
  password: { $nin: [null, ''] },
};

export const hasActivatedParent = async (studentId) =>
  Boolean(await Parent.exists({ ...ACTIVATED_PARENT, studentIds: studentId }));

// The rule is on unless a super admin has stored it off.
export const activatedParentRequired = async () => {
  const row = await OrderingSettings.findOne({ key: 'ordering' }).select('requireActivatedParent').lean();
  return row?.requireActivatedParent !== false;
};

export const orderingSettingsView = (row) => ({
  requireActivatedParent: row?.requireActivatedParent !== false,
  updatedAt: row?.updatedAt ?? null,
  updatedBy: row?.updatedBy ? { id: String(row.updatedBy._id), name: row.updatedBy.name } : null,
});

export const orderingSettings = async () => orderingSettingsView(
  await OrderingSettings.findOne({ key: 'ordering' }).populate('updatedBy', 'name').lean(),
);
