import Admin from '../models/Admin.js';
import FeatureVisibility from '../models/FeatureVisibility.js';
import { overridesOf } from '../controllers/featureController.js';
import { effectiveHidden } from '../utils/featureCatalogue.js';

/* What one account does not see: its role's list, then its own exceptions,
   and nothing at all for a super admin. GET /admin/me answers with this, and
   requireFeature refuses with it, so the two can never disagree. */
export const hiddenFeaturesOf = async (admin) => {
  const role = admin?.role || 'admin';
  const isSuperAdmin = role === 'admin' && admin?.isSuperAdmin === true;
  const roleRow = isSuperAdmin ? null : await FeatureVisibility.findOne({ role }).lean();
  return {
    role,
    isSuperAdmin,
    hidden: effectiveHidden({
      role,
      isSuperAdmin,
      roleHidden: roleRow ? roleRow.hidden : null,
      overrides: overridesOf(admin),
    }),
  };
};

/* Most hides are only a hide — a hidden screen still answers a typed URL.
   A feature that moves money is refused as well: hiding Delete from an
   account must mean that account cannot delete, whatever it sends. Runs after
   protectAdmin. */
/* `applies` narrows the gate to some requests on a shared route — a status
   change that cancels is refused where one that packs is not. */
export const requireFeature = (key, { applies = () => true } = {}) => async (req, res, next) => {
  if (!applies(req)) return next();
  try {
    const admin = await Admin.findById(req.staff.id)
      .select('role isSuperAdmin featureOverrides')
      .lean();
    if (!admin) return res.status(401).json({ message: 'Not authorized', code: 'AUTH_REQUIRED' });
    const { hidden } = await hiddenFeaturesOf(admin);
    if (hidden.includes(key)) {
      return res.status(403).json({
        message: 'This action has been switched off for your account by a super admin.',
        code: 'FEATURE_HIDDEN',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};
