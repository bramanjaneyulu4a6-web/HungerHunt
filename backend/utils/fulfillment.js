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
      ...(student.hostelId ? { hostelId: student.hostelId } : {}),
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

  if (session) {
    const [order] = await FulfillmentOrder.create([document], { session });
    return order;
  }
  return FulfillmentOrder.create(document);
};
