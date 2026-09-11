import mongoose from 'mongoose';

import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Parent from '../models/Parent.js';
import { isTestAccountPhone } from '../config/paymentAccess.js';
import { OrderStatus, canTransitionOrder } from '../src/domain/fulfillment/orderState.js';
import { buildProofOfDelivery } from '../src/domain/fulfillment/proofOfDelivery.js';
import { parentPackageView } from './parentController.js';

/* The PhonePe reviewer standing in for the storeroom and the dorm.
 *
 * A review order has to end the way a real one does — packed, out for
 * delivery, handed to the caretaker, collected by the student's code — and
 * nobody is going to walk a reviewer's package across a campus. So the test
 * parent may run the whole chain themselves, in one call, with the proof of
 * delivery filled in with placeholders instead of typed.
 *
 * Only the test account. The gate is PHONEPE_TEST_PARENT_PHONES and nothing
 * else: no list, no test account, and a real family gets a refusal before a
 * single package is looked up. The state machine is walked, not skipped —
 * every step is a legal transition and is recorded in the trail, so the
 * warehouse and admin screens read a simulated package the same way they
 * read a real one, apart from the note on each step saying who did it. */

const ROUTE = Object.freeze([
  OrderStatus.PACKED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.COLLECTED,
]);

const STAMP = Object.freeze({
  [OrderStatus.PACKED]: 'packedAt',
  [OrderStatus.OUT_FOR_DELIVERY]: 'dispatchedAt',
  [OrderStatus.DELIVERED]: 'deliveredAt',
  [OrderStatus.COLLECTED]: 'collectedAt',
});

export const SIMULATED_RECEIVER = Object.freeze({
  receivedBy: 'Test Receiver',
  receiverPhone: '9000000000',
});

// The trail carries no actorId on these steps, like a migration's entries: no
// member of staff did this, and the note says what did instead.
const SIMULATION_NOTE = 'Simulated by the PhonePe test parent';

export const simulateWarehouse = async (req, res) => {
  try {
    if (!isTestAccountPhone(req.parent?.phone)) {
      return res.status(403).json({
        message: 'Only the PhonePe test account can simulate the warehouse.',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) {
      return res.status(404).json({ message: 'This package could not be found.' });
    }

    const parent = await Parent.findById(req.parent.id).select('studentIds').lean();

    if (!parent) {
      return res.status(401).json({ message: 'Parent account not found' });
    }

    const owned = { $in: parent.studentIds.map(String) };
    const current = await FulfillmentOrder.findOne({
      _id: req.params.orderId,
      studentId: owned,
    }).lean();

    if (!current) {
      return res.status(404).json({ message: 'This package could not be found.' });
    }

    const steps = ROUTE.slice(ROUTE.indexOf(current.status) + 1);

    if (steps.length === 0 || !canTransitionOrder(current.status, steps[0])) {
      return res.status(409).json({
        message:
          current.status === OrderStatus.COLLECTED
            ? 'This package has already been delivered.'
            : 'This package is cancelled, so there is nothing to deliver.',
        currentStatus: current.status,
      });
    }

    /* Each step a second apart, so the trail and the timestamps read in the
       order they would have happened, and a report that measures one stage
       against the next never sees a zero. */
    const startedAt = Date.now();
    const set = { status: OrderStatus.COLLECTED };
    const transitions = [];
    let from = current.status;

    steps.forEach((to, index) => {
      const at = new Date(startedAt + index * 1000);
      set[STAMP[to]] = at;

      if (to === OrderStatus.DELIVERED) {
        // recordedBy wants a staff account; there is none, so the parent who
        // pressed the button stands in — the note is what says it was them.
        set.proofOfDelivery = buildProofOfDelivery({
          ...SIMULATED_RECEIVER,
          recordedBy: req.parent.id,
          recordedAt: at,
        });
        set.deliveryNote = SIMULATION_NOTE;
      }

      transitions.push({ from, to, at, note: SIMULATION_NOTE });
      from = to;
    });

    const updated = await FulfillmentOrder.findOneAndUpdate(
      { _id: current._id, status: current.status, studentId: owned },
      { $set: set, $push: { transitions: { $each: transitions } } },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(409).json({
        message: 'The package moved while it was being simulated. Refresh and try again.',
      });
    }

    res.json({
      message: 'Delivered. The warehouse and caretaker steps were simulated.',
      package: parentPackageView(updated, new Date(), null, { testAccount: true }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
