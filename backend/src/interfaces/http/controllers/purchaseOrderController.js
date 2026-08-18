import mongoose from 'mongoose';
import {
  parseCreatePurchaseOrderRequest,
  parsePurchaseOrderDecisionRequest,
  toPurchaseOrderResponse,
} from '../../../application/procurement/dtos.js';
import { CreatePurchaseOrder } from '../../../application/procurement/useCases/createPurchaseOrder.js';
import { ReviewPurchaseOrder } from '../../../application/procurement/useCases/reviewPurchaseOrder.js';
import { purchaseOrderStatuses } from '../../../domain/procurement/purchaseOrderState.js';
import { MongoosePurchaseOrderRepository } from '../../../infrastructure/persistence/mongoose/mongoosePurchaseOrderRepository.js';
import { ValidationError } from '../../../shared/errors/applicationError.js';

const repository = new MongoosePurchaseOrderRepository();
const createPurchaseOrder = new CreatePurchaseOrder({ purchaseOrderRepository: repository });
const reviewPurchaseOrder = new ReviewPurchaseOrder({ purchaseOrderRepository: repository });

export const create = async (req, res) => {
  const request = parseCreatePurchaseOrderRequest(req.body);
  const purchase = await createPurchaseOrder.execute({ request, actor: req.staff });
  res.status(201).json({ data: toPurchaseOrderResponse(purchase), meta: { requestId: req.context.requestId } });
};

export const review = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ValidationError([{ field: 'id', message: 'Must be a valid identifier.' }]);
  }
  const request = parsePurchaseOrderDecisionRequest(req.body);
  const purchase = await reviewPurchaseOrder.execute({
    id: req.params.id,
    ...request,
    actor: req.staff,
  });
  res.json({ data: toPurchaseOrderResponse(purchase), meta: { requestId: req.context.requestId } });
};

export const list = async (req, res) => {
  const status = req.query.status?.toUpperCase();
  if (status && !purchaseOrderStatuses.includes(status)) {
    throw new ValidationError([{ field: 'status', message: 'Unknown purchase-order status.' }]);
  }
  const purchases = await repository.find(status ? { status } : { status: { $in: purchaseOrderStatuses } });
  res.json({
    data: purchases.map(toPurchaseOrderResponse),
    meta: { requestId: req.context.requestId, count: purchases.length },
  });
};

