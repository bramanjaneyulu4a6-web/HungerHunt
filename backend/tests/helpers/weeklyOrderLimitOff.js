import { mock } from 'node:test';

/* For suites that charge or raise orders but are not about the one-order-a-week
   rule (utils/weeklyOrderLimit.js): the stored settings read as every ordering
   rule switched off, so no package or pending-order lookup is made. Takes the
   model for the same reason parentGateOpen.js does. weeklyOrderLimit.test.js
   covers the rule itself. */
export const weeklyOrderLimitOff = (OrderingSettings) => {
  const query = {
    select() { return this; },
    populate() { return this; },
    session() { return this; },
    lean: async () => ({ requireActivatedParent: false, oneOrderPerWeek: false }),
  };
  mock.method(OrderingSettings, 'findOne', () => query);
};
