import OrderingSettings from '../models/OrderingSettings.js';
import { orderingSettings, orderingSettingsView } from '../utils/parentActivation.js';

export const getOrderingSettings = async (req, res) => {
  res.json(await orderingSettings());
};

export const setOrderingSettings = async (req, res) => {
  // Each rule is saved on its own, so a request names only the one it changes.
  const changes = {};
  for (const field of ['requireActivatedParent', 'oneOrderPerWeek']) {
    const value = req.body?.[field];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      return res.status(400).json({ message: `${field} must be true or false.` });
    }
    changes[field] = value;
  }

  if (!Object.keys(changes).length) {
    return res.status(400).json({ message: 'Name a rule to change: requireActivatedParent or oneOrderPerWeek.' });
  }

  const row = await OrderingSettings.findOneAndUpdate(
    { key: 'ordering' },
    { $set: { ...changes, updatedBy: req.staff.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .populate('updatedBy', 'name')
    .lean();

  res.json(orderingSettingsView(row));
};
