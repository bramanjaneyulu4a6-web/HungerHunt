import mongoose from 'mongoose';

import { SETTABLE_ROLES } from '../utils/featureCatalogue.js';

// One row per role: the console features a plain account of that role does not
// see. Absent row means the built-in default applies; a row with an empty
// list means a super admin chose to show everything. Per-account exceptions
// live on the Admin row itself (featureOverrides), next to the account.
const featureVisibilitySchema = new mongoose.Schema({
  role: { type: String, enum: SETTABLE_ROLES, required: true, unique: true },
  hidden: { type: [String], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

export default mongoose.model('FeatureVisibility', featureVisibilitySchema);
