import { PurchaseOrderStatus } from '../../../domain/procurement/purchaseOrderState.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/applicationError.js';

export class ReviewPurchaseOrder {
  constructor({ purchaseOrderRepository, clock = () => new Date() }) {
    this.purchaseOrderRepository = purchaseOrderRepository;
    this.clock = clock;
  }

  async execute({ id, decision, reason, actor }) {
    const updated = await this.purchaseOrderRepository.transition({
      id,
      from: PurchaseOrderStatus.PENDING_REVIEW,
      to: decision,
      changes: {
        reviewedBy: actor.id,
        reviewedAt: this.clock(),
        reviewReason: reason,
        ...(decision === PurchaseOrderStatus.APPROVED ? { approvedAt: this.clock() } : {}),
        ...(decision === PurchaseOrderStatus.REJECTED ? { rejectedAt: this.clock() } : {}),
      },
    });

    if (updated) return updated;

    const current = await this.purchaseOrderRepository.findById(id);
    if (!current) throw new NotFoundError('Purchase order');
    throw new ConflictError(
      `Purchase order is ${current.status}; only PENDING_REVIEW orders can be reviewed.`,
      { currentStatus: current.status, expectedStatus: PurchaseOrderStatus.PENDING_REVIEW }
    );
  }
}

