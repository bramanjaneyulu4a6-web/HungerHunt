import { formatINR } from './format.js';

/* The controls a parent holds over a student's wallet, as the Students table
   shows them beside the balance: on or off, and a sentence saying so.
   Pure, so it can be tested without React. */

const LIMIT_PERIOD = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' };

/* Two marks. The first is who approves the student's orders: a person for the
   parent, swapped for a C when the parent has handed approvals to the room
   caretaker (which only counts while parent approval is on; the server ignores
   it otherwise). Green when on, gray when off. The second is the spending
   limit, yellow-orange when on, gray when off. */
export const walletControlStates = (student) => {
  const parentOn = student.requiresParentApproval === true;
  const caretakerOn = parentOn && student.caretakerMayApprove === true;
  const control = student.walletControl;
  const limitOn = control?.enabled === true;

  return [
    {
      key: 'approval',
      glyph: caretakerOn ? 'caretaker' : 'parent',
      tone: 'green',
      on: parentOn,
      label: caretakerOn
        ? 'Ask caretaker approval: on'
        : `Ask parent approval: ${parentOn ? 'on' : 'off'}`,
    },
    {
      key: 'limit',
      glyph: 'limit',
      tone: 'amber',
      on: limitOn,
      label: limitOn
        ? `Spending limit: ${formatINR(control.limitAmount)} per ${LIMIT_PERIOD[control.limitType] || 'week'}`
        : 'Spending limit: off',
    },
  ];
};
