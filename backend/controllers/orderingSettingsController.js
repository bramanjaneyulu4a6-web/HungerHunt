import OrderingSettings from '../models/OrderingSettings.js';
import { orderingSettings, orderingSettingsView } from '../utils/parentActivation.js';

export const getOrderingSettings = async (req, res) => {
  res.json(await orderingSettings());
};

export const setOrderingSettings = async (req, res) => {
  const { requireActivatedParent } = req.body ?? {};

  if (typeof requireActivatedParent !== 'boolean') {
    return res.status(400).json({ message: 'requireActivatedParent must be true or false.' });
  }

  const row = await OrderingSettings.findOneAndUpdate(
    { key: 'ordering' },
    { $set: { requireActivatedParent, updatedBy: req.staff.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .populate('updatedBy', 'name')
    .lean();

  res.json(orderingSettingsView(row));
};
