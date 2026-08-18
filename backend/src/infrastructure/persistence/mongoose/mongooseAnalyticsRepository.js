import Inventory from '../../../../models/Inventory.js';
import Product from '../../../../models/Product.js';
import Purchase from '../../../../models/Purchase.js';
import Transaction from '../../../../models/Transaction.js';

export class MongooseAnalyticsRepository {
  async loadSnapshot({ from }) {
    const [products, inventory, transactions, purchases] = await Promise.all([
      Product.find({ active: { $ne: false } }).lean(),
      Inventory.find().lean(),
      Transaction.find({ createdAt: { $gte: from } }).select('items createdAt').lean(),
      Purchase.find({ createdAt: { $gte: from } })
        .populate('supplierId', 'leadTimeDays')
        .lean(),
    ]);

    const stockByProduct = new Map(
      inventory.map((row) => [String(row.productId), Number(row.stock) || 0])
    );

    return {
      products: products.map((product) => ({
        id: String(product._id),
        name: product.name,
        currentStock: stockByProduct.get(String(product._id)) ?? 0,
        reorderLevel: Number(product.reorderLevel) || 0,
        safetyStock: Number(product.safetyStock) || 0,
      })),
      usageEvents: transactions.flatMap((transaction) =>
        transaction.items
          .filter((item) => item.productId && Number(item.quantity) > 0)
          .map((item) => ({
            productId: String(item.productId),
            quantity: Number(item.quantity),
            occurredAt: transaction.createdAt,
          }))
      ),
      purchaseOrders: purchases.map((purchase) => ({
        id: String(purchase._id),
        status: purchase.status,
        createdAt: purchase.createdAt,
        reviewedAt: purchase.reviewedAt,
        approvedAt: purchase.approvedAt,
        rejectedAt: purchase.rejectedAt,
        completedAt: purchase.completedAt,
        receivedAt: purchase.receivedAt,
        supplierLeadTimeDays: Number(purchase.supplierId?.leadTimeDays),
        items: purchase.items.map((item) => ({
          productId: String(item.productId),
          quantity: Number(item.quantity) || 0,
          unitCost: Number(item.purchasePrice) || 0,
        })),
      })),
    };
  }
}

