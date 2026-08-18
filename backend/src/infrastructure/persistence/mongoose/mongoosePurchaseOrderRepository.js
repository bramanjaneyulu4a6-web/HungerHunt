import Purchase from '../../../../models/Purchase.js';

export class MongoosePurchaseOrderRepository {
  async create(order, { session } = {}) {
    const [created] = await Purchase.create([{ ...order }], { session });
    return typeof created.populate === 'function'
      ? created.populate([
          { path: 'supplierId', select: 'name leadTimeDays' },
          { path: 'items.productId', select: 'name' },
        ])
      : created;
  }

  async findById(id) {
    const purchase = await Purchase.findById(id);
    return typeof purchase?.populate === 'function'
      ? purchase.populate([
          { path: 'supplierId', select: 'name leadTimeDays' },
          { path: 'items.productId', select: 'name' },
        ])
      : purchase;
  }

  find(filter = {}) {
    let query = Purchase.find(filter);
    if (typeof query.populate === 'function') {
      query = query
        .populate('supplierId', 'name leadTimeDays')
        .populate('items.productId', 'name');
    }
    query = query.sort({ createdAt: -1 });
    return typeof query.limit === 'function' ? query.limit(500) : query;
  }

  async transition({ id, from, to, changes }, { session } = {}) {
    const purchase = await Purchase.findOneAndUpdate(
      { _id: id, status: from },
      { $set: { status: to, ...changes } },
      { new: true, runValidators: true, session }
    );
    return typeof purchase?.populate === 'function'
      ? purchase.populate([
          { path: 'supplierId', select: 'name leadTimeDays' },
          { path: 'items.productId', select: 'name' },
        ])
      : purchase;
  }
}
