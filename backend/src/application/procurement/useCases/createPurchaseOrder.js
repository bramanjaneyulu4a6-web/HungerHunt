import { PurchaseOrderStatus } from '../../../domain/procurement/purchaseOrderState.js';

export class CreatePurchaseOrder {
  constructor({ purchaseOrderRepository, clock = () => new Date() }) {
    this.purchaseOrderRepository = purchaseOrderRepository;
    this.clock = clock;
  }

  execute({ request, actor }) {
    return this.purchaseOrderRepository.create({
      ...request,
      status: PurchaseOrderStatus.PENDING_REVIEW,
      raisedBy: actor.id,
      submittedAt: this.clock(),
    });
  }
}

