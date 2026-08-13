import mongoose from 'mongoose';
import { PurchaseOrderStatus } from '../../domain/procurement/purchaseOrderState.js';
import { ValidationError } from '../../shared/errors/applicationError.js';

const objectId = (value) => mongoose.Types.ObjectId.isValid(value);
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const nonNegativeMoney = (value) => Number.isFinite(value) && value >= 0;

export const parseCreatePurchaseOrderRequest = (body = {}) => {
  const errors = [];
  if (body.supplierId != null && body.supplierId !== '' && !objectId(body.supplierId)) {
    errors.push({ field: 'supplierId', message: 'Must be a valid identifier.' });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push({ field: 'items', message: 'At least one line is required.' });
  }

  const byProduct = new Map();
  for (const [index, item] of (body.items ?? []).entries()) {
    const validProduct = objectId(item?.productId);
    if (!validProduct) {
      errors.push({ field: `items[${index}].productId`, message: 'Must be a valid identifier.' });
    }
    if (!positiveInteger(item.quantity)) {
      errors.push({ field: `items[${index}].quantity`, message: 'Must be a positive whole number.' });
    }
    if (item.estimatedUnitCost != null && !nonNegativeMoney(item.estimatedUnitCost)) {
      errors.push({ field: `items[${index}].estimatedUnitCost`, message: 'Must be a non-negative number.' });
    }

    if (!validProduct) continue;

    const key = String(item.productId);
    const line = byProduct.get(key) ?? {
      productId: item.productId,
      quantity: 0,
      purchasePrice: 0,
    };
    if (positiveInteger(item.quantity)) line.quantity += item.quantity;
    if (item.estimatedUnitCost != null) line.purchasePrice = item.estimatedUnitCost;
    byProduct.set(key, line);
  }

  if (errors.length) throw new ValidationError(errors);

  return Object.freeze({
    supplierId: body.supplierId || undefined,
    reason: String(body.reason ?? '').trim().slice(0, 500),
    items: [...byProduct.values()],
  });
};

export const parsePurchaseOrderDecisionRequest = (body = {}) => {
  const decision = String(body.decision ?? '').toUpperCase();
  const reason = String(body.reason ?? '').trim().slice(0, 500);
  const valid = [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.REJECTED];
  const errors = [];

  if (!valid.includes(decision)) {
    errors.push({ field: 'decision', message: `Must be one of: ${valid.join(', ')}.` });
  }
  if (decision === PurchaseOrderStatus.REJECTED && !reason) {
    errors.push({ field: 'reason', message: 'A rejection reason is required.' });
  }
  if (errors.length) throw new ValidationError(errors);

  return Object.freeze({ decision, reason });
};

export const toPurchaseOrderResponse = (purchase) => ({
  id: String(purchase._id),
  status: purchase.status,
  supplierId: purchase.supplierId ? String(purchase.supplierId._id ?? purchase.supplierId) : null,
  supplierName: purchase.supplierId?.name ?? null,
  reason: purchase.reason ?? '',
  items: purchase.items.map((item) => ({
    productId: String(item.productId?._id ?? item.productId),
    productName: item.productId?.name ?? null,
    quantity: item.quantity,
    receivedQuantity: item.received ?? 0,
    estimatedUnitCost: item.purchasePrice ?? 0,
  })),
  requestedBy: purchase.raisedBy ? String(purchase.raisedBy._id ?? purchase.raisedBy) : null,
  reviewedBy: purchase.reviewedBy ? String(purchase.reviewedBy._id ?? purchase.reviewedBy) : null,
  reviewReason: purchase.reviewReason ?? '',
  submittedAt: purchase.createdAt,
  reviewedAt: purchase.reviewedAt ?? null,
});
