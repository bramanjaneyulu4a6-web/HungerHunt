import { PurchaseOrderStatus } from '../../../domain/procurement/purchaseOrderState.js';
import { ConflictError } from '../../../shared/errors/applicationError.js';

/* Accounts approval is the stock-booking event for reviewed purchase orders.
 * Every write is run in the caller's Mongo transaction: the review claim,
 * inventory increments, received counts, audit receipt and terminal status
 * either all land or none do. The PENDING_REVIEW claim is also the retry
 * guard — only one request can ever add this order to the shelf. */
export class ApprovePurchaseOrderIntoInventory {
  constructor({
    reviewPurchaseOrder,
    purchaseOrderRepository,
    inventoryRepository,
    goodsReceiptRepository,
    clock = () => new Date(),
  }) {
    this.reviewPurchaseOrder = reviewPurchaseOrder;
    this.purchaseOrderRepository = purchaseOrderRepository;
    this.inventoryRepository = inventoryRepository;
    this.goodsReceiptRepository = goodsReceiptRepository;
    this.clock = clock;
  }

  async execute({ id, reason, actor, session = null }) {
    const approved = await this.reviewPurchaseOrder.execute({
      id,
      decision: PurchaseOrderStatus.APPROVED,
      reason,
      actor,
      session,
    });

    for (const item of approved.items) {
      const productId = item.productId?._id ?? item.productId;
      await this.inventoryRepository.add(productId, item.quantity, { session });
      await this.purchaseOrderRepository.setLineReceived(
        id,
        productId,
        item.quantity,
        { session }
      );
    }

    await this.goodsReceiptRepository.create({
      purchaseId: approved._id,
      receivedBy: actor.id,
      invoiceNumber: '',
      note: 'Inventory booked automatically when Accounts approved the order.',
      stockApplied: true,
      clientToken: `approval-${approved._id}`,
      lines: approved.items.map((item) => ({
        productId: item.productId?._id ?? item.productId,
        received: item.quantity,
        damaged: 0,
        ...(Number.isFinite(Number(item.purchasePrice))
          ? { purchasePrice: Number(item.purchasePrice) }
          : {}),
      })),
    }, { session });

    const now = this.clock();
    const received = await this.purchaseOrderRepository.transition({
      id,
      from: PurchaseOrderStatus.APPROVED,
      to: PurchaseOrderStatus.RECEIVED,
      changes: { receivedAt: now, completedAt: now },
    }, { session });

    if (!received) {
      throw new ConflictError('Purchase order changed while inventory was being booked.');
    }

    return received;
  }
}
