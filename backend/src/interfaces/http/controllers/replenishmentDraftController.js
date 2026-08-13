import mongoose from 'mongoose';
import Purchase from '../../../../models/Purchase.js';
import ReplenishmentDraft from '../../../../models/ReplenishmentDraft.js';
import { GenerateInventoryAnalytics } from '../../../application/analytics/generateInventoryAnalytics.js';
import { buildReplenishmentDraftItems } from '../../../application/replenishment/buildDraft.js';
import { MongooseAnalyticsRepository } from '../../../infrastructure/persistence/mongoose/mongooseAnalyticsRepository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/applicationError.js';
import { sessionOptions, withMongoTransaction } from '../../../../utils/mongoTransaction.js';
import { businessDateAt } from '../../../../utils/businessTime.js';

const DAY_MS = 86_400_000;
const analyticsUseCase = new GenerateInventoryAnalytics({
  analyticsRepository: new MongooseAnalyticsRepository(),
  config: {
    highVelocityUnitsPerDay: Number(process.env.ANALYTICS_HIGH_VELOCITY_PER_DAY) || 1,
    defaultLeadTimeDays: Number(process.env.ANALYTICS_DEFAULT_LEAD_TIME_DAYS) || 7,
    orderingCost: Number(process.env.ANALYTICS_ORDERING_COST) || 250,
    annualHoldingRate: Number(process.env.ANALYTICS_ANNUAL_HOLDING_RATE) || 0.2,
  },
});

const response = (draft) => ({
  id: String(draft._id), status: draft.status, analyticsDate: draft.analyticsDate,
  analyticsAsOf: draft.analyticsAsOf, analyticsSchemaVersion: draft.analyticsSchemaVersion,
  expiresAt: draft.expiresAt, items: draft.items,
  submittedPurchaseId: draft.submittedPurchaseId ? String(draft.submittedPurchaseId) : null,
});

export const generate = async (req, res) => {
  const now = new Date();
  const analyticsDate = businessDateAt(now);
  await ReplenishmentDraft.updateMany(
    { createdBy: req.staff.id, status: 'ACTIVE', expiresAt: { $lte: now } },
    { $set: { status: 'EXPIRED' } }
  );
  const existing = await ReplenishmentDraft.findOne({
    createdBy: req.staff.id, analyticsDate, status: 'ACTIVE', expiresAt: { $gt: now },
  });
  if (existing) return res.json({ data: response(existing), meta: { requestId: req.context.requestId, replayed: true } });

  const [analytics, openOrders] = await Promise.all([
    analyticsUseCase.execute({ asOf: now }),
    Purchase.find({ status: { $in: ['PENDING_REVIEW', 'APPROVED', 'PARTIALLY_RECEIVED'] } })
      .select('status items').lean(),
  ]);
  const items = buildReplenishmentDraftItems({ analytics, purchaseOrders: openOrders });
  let draft;
  try {
    draft = await ReplenishmentDraft.create({
      createdBy: req.staff.id,
      analyticsDate,
      analyticsAsOf: now,
      analyticsSchemaVersion: analytics.schemaVersion,
      items,
      expiresAt: new Date(now.getTime() + 7 * DAY_MS),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    draft = await ReplenishmentDraft.findOne({
      createdBy: req.staff.id,
      analyticsDate,
      status: { $in: ['ACTIVE', 'SUBMITTING'] },
    });
    if (!draft) throw error;
    return res.json({ data: response(draft), meta: { requestId: req.context.requestId, replayed: true } });
  }
  res.status(201).json({ data: response(draft), meta: { requestId: req.context.requestId } });
};

export const submit = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ValidationError([{ field: 'id', message: 'Must be a valid identifier.' }]);
  }
  const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!requestedItems.length || requestedItems.some((item) =>
    !mongoose.Types.ObjectId.isValid(item.productId) || !Number.isInteger(item.quantity) || item.quantity <= 0
  )) {
    throw new ValidationError([{ field: 'items', message: 'Use draft products with positive whole quantities.' }]);
  }

  const result = await withMongoTransaction(async (session) => {
    const draft = await ReplenishmentDraft.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.staff.id, status: 'ACTIVE', expiresAt: { $gt: new Date() } },
      { $set: { status: 'SUBMITTING' } },
      { new: true, ...sessionOptions(session) }
    );
    if (!draft) throw new ConflictError('Draft is missing, expired, or already submitted.');
    const allowed = new Set(draft.items.map((item) => String(item.productId)));
    if (requestedItems.some((item) => !allowed.has(String(item.productId)))) {
      throw new ValidationError([{ field: 'items', message: 'Products cannot be added outside this draft.' }]);
    }
    const document = {
      status: 'PENDING_REVIEW', raisedBy: req.staff.id,
      reason: 'Analytics-assisted replenishment draft',
      ...(req.body.supplierId ? { supplierId: req.body.supplierId } : {}),
      items: requestedItems.map((item) => {
        const source = draft.items.find((line) => String(line.productId) === String(item.productId));
        return {
          productId: item.productId,
          quantity: item.quantity,
          ...(Number.isFinite(source?.estimatedUnitCost)
            ? { purchasePrice: source.estimatedUnitCost }
            : {}),
        };
      }),
    };
    const purchase = session
      ? (await Purchase.create([document], { session }))[0]
      : await Purchase.create(document);
    await ReplenishmentDraft.updateOne(
      { _id: draft._id, status: 'SUBMITTING' },
      { $set: { status: 'SUBMITTED', submittedAt: new Date(), submittedPurchaseId: purchase._id } },
      sessionOptions(session)
    );
    return purchase;
  });
  res.status(201).json({ data: { purchaseOrderId: String(result._id), status: result.status }, meta: { requestId: req.context.requestId } });
};
