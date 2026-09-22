import { mock } from 'node:test';

/* For suites that open kiosk sessions but are not about the activated-parent
   rule (utils/parentActivation.js): the stored settings read as the rule
   switched off, so no parent lookup is made and the suite's own Parent stubs,
   if any, are left alone. The weekly order limit reads as off too, for the
   same reason — see weeklyOrderLimitOff.js. Takes the model for the same reason featuresOpen.js
   does. parentActivationGate.test.js covers the rule itself. */
export const parentGateOpen = (OrderingSettings) => {
  const query = { select() { return this; }, populate() { return this; }, session() { return this; }, lean: async () => ({ requireActivatedParent: false, oneOrderPerWeek: false }) };
  mock.method(OrderingSettings, 'findOne', () => query);
};
