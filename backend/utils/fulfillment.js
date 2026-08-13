import FulfillmentOrder from '../models/FulfillmentOrder.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { businessPeriodStart } from './businessTime.js';

export const DELIVERY_WINDOW_MS = 2 * 24 * 60 * 60 * 1_000;

export const fulfillmentSchedule = (
  orderedAt = new Date(),
  timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata'
) => ({
  orderedAt,
  businessWeekStart: businessPeriodStart('WEEKLY', orderedAt, timeZone),
  deliverBy: new Date(orderedAt.getTime() + DELIVERY_WINDOW_MS),
});

export const findWeeklyFulfillment = ({ studentId, orderedAt = new Date(), session = null }) => {
  const { businessWeekStart } = fulfillmentSchedule(orderedAt);
  const query = FulfillmentOrder.findOne({ studentId, businessWeekStart, status: { $ne: OrderStatus.CANCELLED } });
  return session ? query.session(session) : query;
};

export const createFulfillmentOrder = async ({
  transaction,
  student,
  session = null,
  orderedAt = new Date(),
}) => {
  const schedule = fulfillmentSchedule(orderedAt);
  const document = {
    transactionId: transaction._id,
    studentId: student._id,
    studentSnapshot: {
      name: student.name,
      admissionNumber: student.admissionNumber || '',
      hostelNumber: student.hostelNumber,
    },
    items: transaction.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    totalAmount: transaction.totalAmount,
    status: OrderStatus.PENDING,
    ...schedule,
  };

  try {
    if (session) {
      const [order] = await FulfillmentOrder.create([document], { session });
      return order;
    }
    return await FulfillmentOrder.create(document);
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error('This student has already placed an order this business week.');
      conflict.status = 409;
      conflict.code = 'WEEKLY_ORDER_LIMIT';
      throw conflict;
    }
    throw error;
  }
};
