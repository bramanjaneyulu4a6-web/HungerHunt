// Extension included on the import in the test so this module runs under
// `node --test` as well as Vite.

/* The warehouse, as the PhonePe reviewer sees it.
 *
 * A real package is moved by three people the reviewer does not have: the
 * storeroom packs it and sends it out, the caretaker signs for it at the room,
 * and the student ends it by typing their purchase code. The test account may
 * do all of that with one button (POST /parent/packages/:id/simulate-warehouse),
 * and this is the story the dialog tells while the request runs — the same
 * four steps, in the same order, with the same names the real screens use.
 *
 * Pure so the timing can be tested: the dialog owns a clock and asks this
 * module which step the clock has reached. */

export const SIMULATION_STEPS = Object.freeze([
  Object.freeze({
    status: 'PACKED',
    title: 'Packed',
    actor: 'Warehouse',
    detail: 'The storeroom picks the items and seals the package.',
    icon: 'package',
  }),
  Object.freeze({
    status: 'OUT_FOR_DELIVERY',
    title: 'Out for delivery',
    actor: 'Warehouse',
    detail: 'The package leaves with the delivery round to the dorm.',
    icon: 'truck',
  }),
  Object.freeze({
    status: 'DELIVERED',
    title: 'Handed to the caretaker',
    actor: 'Caretaker',
    detail: 'The caretaker at the room signs for it by name and phone.',
    icon: 'user',
  }),
  Object.freeze({
    status: 'COLLECTED',
    title: 'Delivered',
    actor: 'Student',
    detail: 'The student types their purchase code and takes the package.',
    icon: 'check',
  }),
]);

/* What the server fills in for the steps that normally need a person to
   type: shown up front so the reviewer knows the proof of delivery will not
   ask them anything. Mirrors SIMULATED_RECEIVER on the backend. */
export const SIMULATION_DEFAULTS = Object.freeze({
  receivedBy: 'Test Receiver',
  receiverPhone: '9000000000',
  purchaseCode: 'entered by the student (skipped)',
});

// How long each step is on screen. Long enough to read, short enough that
// the whole route is over before anyone reaches for the close button.
export const STEP_MS = 1100;

/* Which steps the clock has reached: the count of completed steps, so 0 is
   "nothing yet" and SIMULATION_STEPS.length is "delivered". Steps complete
   one after another, never two at once, whatever the clock says. */
export const completedSteps = (elapsedMs, stepMs = STEP_MS) => {
  if (!(elapsedMs > 0) || !(stepMs > 0)) return 0;
  return Math.min(SIMULATION_STEPS.length, Math.floor(elapsedMs / stepMs));
};

// The whole route, from the first tick to the last step lighting up.
export const routeDurationMs = (stepMs = STEP_MS) => SIMULATION_STEPS.length * stepMs;

/* The animation and the request race; the delivered screen waits for both.
   The reply may arrive in a hundred milliseconds, and cutting the route
   short would leave the reviewer reading "Packed" one moment and "Delivered"
   the next with no story in between. A refusal ends it at once — there is
   nothing to animate towards. */
export const simulationPhase = ({ elapsedMs, reply, stepMs = STEP_MS }) => {
  if (reply?.error) return 'failed';
  if (completedSteps(elapsedMs, stepMs) < SIMULATION_STEPS.length) return 'running';
  return reply?.ok ? 'delivered' : 'settling';
};
