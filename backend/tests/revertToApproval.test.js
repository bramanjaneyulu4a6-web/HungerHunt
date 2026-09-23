// Deciding what may be done to a "Confirmed" package that should never have
// been charged — see utils/revertToApproval.js.
//
// The decision is separated from the writing because the writing is expensive
// and irreversible: it moves real money in real wallets. Every refusal below
// is a family whose package is left exactly as it was, and every REVERT is a
// wallet that gets credited and a phone that buzzes, so which one a package
// gets is worth pinning down in a test rather than reading off a script that
// has already run.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { classifyPackage, approvalItemsFrom, expectationProblem, planPackages } = await import(
  '../utils/revertToApproval.js'
);

const productId = '64b7f9e2c1a4d2e001aa0001';

const scenario = (overrides = {}) => ({
  order: { _id: 'order-1', status: 'PENDING', totalAmount: 120 },
  transaction: {
    _id: 'txn-1',
    totalAmount: 120,
    deletion: null,
    items: [{ productId, name: 'Samosa', quantity: 2, price: 60 }],
  },
  student: { _id: 'student-1', name: 'Asha', demoAccount: false, requiresParentApproval: true },
  parent: { _id: 'parent-1' },
  hasLiveRequest: false,
  ...overrides,
});

describe('classifyPackage', () => {
  test('a charged package with a linked parent is reverted in full', () => {
    const plan = classifyPackage(scenario());

    assert.equal(plan.action, 'REVERT');
    assert.deepEqual(plan.warnings, []);
  });

  /* The whole point of the exercise: these packages were rung up while parent
     approval was switched off. Finding the flag still off is not a reason to
     leave the package charged — it is a reason to say so out loud, because the
     next kiosk sale for that student will go the same way. */
  test('reverts, with a warning, when parent approval is still switched off', () => {
    const plan = classifyPackage(
      scenario({ student: { _id: 'student-1', name: 'Asha', requiresParentApproval: false } })
    );

    assert.equal(plan.action, 'REVERT');
    assert.match(plan.warnings.join(' '), /approval is still off/i);
  });

  /* A student may only hold one open request — PendingOrder enforces it with a
     unique index — so a second one cannot be raised. The money still goes back:
     the charge was a mistake whether or not a later request happens to be open,
     and leaving it standing to keep the report tidy would be the wrong way
     round. A later --resume raises the request once the open one is answered. */
  test('refunds without raising when the student already has a request waiting', () => {
    const plan = classifyPackage(scenario({ hasLiveRequest: true }));

    assert.equal(plan.action, 'REFUND_ONLY');
    assert.match(plan.reason, /already has a request/i);
  });

  // Nobody to approve it, so reverting would strand the package in a state no
  // one can answer. Left charged and reported instead.
  test('skips a student with no linked parent', () => {
    const plan = classifyPackage(scenario({ parent: null }));

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /no parent/i);
  });

  test('skips the demo account', () => {
    const plan = classifyPackage(
      scenario({ student: { _id: 'student-1', name: 'Demo', demoAccount: true } })
    );

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /demo/i);
  });

  test('skips a package whose student record has gone', () => {
    const plan = classifyPackage(scenario({ student: null }));

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /student/i);
  });

  test('skips a package whose charge is missing', () => {
    const plan = classifyPackage(scenario({ transaction: null }));

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /charge/i);
  });

  /* Deleting a charge already puts its money back (utils/ledgerDeletion.js).
     Refunding on top of that would credit the wallet twice for one sale. */
  test('skips a charge that was already deleted and refunded', () => {
    const plan = classifyPackage(
      scenario({
        transaction: { ...scenario().transaction, deletion: { at: new Date(), reason: 'typo' } },
      })
    );

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /already/i);
  });

  // Only the first stage is in scope. A packed or dispatched package has left
  // the storeroom, and the refund path refuses it anyway.
  for (const status of ['PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED', 'CANCELLED']) {
    test(`skips a package that is ${status}`, () => {
      const plan = classifyPackage(scenario({ order: { _id: 'order-1', status } }));

      assert.equal(plan.action, 'SKIP');
      assert.match(plan.reason, new RegExp(status, 'i'));
    });
  }

  /* A parent approves a named basket at a named price. A line that lost its
     product or its name cannot be shown to them honestly, so the package is
     left alone for a person to look at rather than re-raised with a blank in
     it. */
  test('skips when a charged line has lost its product', () => {
    const plan = classifyPackage(
      scenario({
        transaction: { ...scenario().transaction, items: [{ name: 'Samosa', quantity: 1, price: 60 }] },
      })
    );

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /line/i);
  });

  test('skips when a charged line has lost its name', () => {
    const plan = classifyPackage(
      scenario({
        transaction: { ...scenario().transaction, items: [{ productId, quantity: 1, price: 60 }] },
      })
    );

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /line/i);
  });

  test('skips a charge with no lines at all', () => {
    const plan = classifyPackage(
      scenario({ transaction: { ...scenario().transaction, items: [] } })
    );

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /line/i);
  });
});

/* --skip-approved, and the distinction it draws.
 *
 * The packages this exercise is for were charged without anybody being asked.
 * A few in the same selection were charged because a parent, or the caretaker
 * they handed the decision to, was asked and said yes — those are not the same
 * mistake, and undoing one means telling a family their answer did not count
 * and asking again. Which of the two a run corrects is the operator's call, so
 * it is a flag rather than a rule. */
describe('classifyPackage with --skip-approved', () => {
  const approved = () => ({
    ...scenario(),
    transaction: { ...scenario().transaction, sourceType: 'PARENT_APPROVAL' },
  });

  test('leaves a package a parent already approved', () => {
    const plan = classifyPackage({ ...approved(), skipApproved: true });

    assert.equal(plan.action, 'SKIP');
    assert.match(plan.reason, /already approved/i);
  });

  test('still reverts a package nobody was asked about', () => {
    const plan = classifyPackage({
      ...scenario(),
      transaction: { ...scenario().transaction, sourceType: 'DIRECT_CHECKOUT' },
      skipApproved: true,
    });

    assert.equal(plan.action, 'REVERT');
  });

  // The flag is off unless asked for: the default stays "correct every charge
  // in the selection", which is what the run was built to do.
  test('reverts an approved package when the flag is not set', () => {
    assert.equal(classifyPackage(approved()).action, 'REVERT');
  });

  /* An approved package that is skipped has claimed nothing, so a kiosk charge
     for the same student later in the run is still raised. Getting this wrong
     would silently drop a real correction. */
  test('a skipped approved package does not claim its student', () => {
    const shared = { _id: 'student-1', name: 'Asha', requiresParentApproval: true };
    const plans = planPackages(
      [
        { ...approved(), student: shared },
        { ...scenario(), student: shared },
      ],
      { skipApproved: true }
    );

    assert.deepEqual(
      plans.map(({ plan }) => plan.action),
      ['SKIP', 'REVERT']
    );
  });

  test('planPackages leaves approved packages alone when told to', () => {
    const plans = planPackages(
      [
        { ...approved(), student: { _id: 'a', name: 'A', requiresParentApproval: true } },
        { ...scenario(), student: { _id: 'b', name: 'B', requiresParentApproval: true } },
      ],
      { skipApproved: true }
    );

    assert.deepEqual(
      plans.map(({ plan }) => plan.action),
      ['SKIP', 'REVERT']
    );
  });
});

describe('expectationProblem', () => {
  test('lets the run proceed when the count is what was expected', () => {
    assert.equal(expectationProblem({ found: 41, expected: '41' }), null);
  });

  /* The failure this guard is for: somebody counts 41 in the console, a kiosk
     rings up a forty-second while they are typing, and the run refunds one
     family who was never part of the mistake. */
  test('stops a run whose selection has grown since it was counted', () => {
    const problem = expectationProblem({ found: 42, expected: '41' });

    assert.match(problem, /expected 41/i);
    assert.match(problem, /found 42/i);
    assert.match(problem, /nothing was written/i);
  });

  test('stops a run whose selection has shrunk', () => {
    assert.match(expectationProblem({ found: 40, expected: '41' }), /found 40/i);
  });

  test('refuses to write without a stated expectation', () => {
    for (const expected of [undefined, null, '']) {
      assert.match(expectationProblem({ found: 41, expected }), /needs --expect/i);
    }
  });

  // '41 ' or '4l' silently becoming NaN, and NaN !== 41 passing as a mismatch,
  // would be a confusing way to be told the right thing. Named instead.
  test('refuses an expectation that is not a whole number', () => {
    for (const expected of ['forty-one', '41.0', '-41', '4 1']) {
      assert.match(expectationProblem({ found: 41, expected }), /whole number/i);
    }
  });

  test('a zero expectation is honoured rather than treated as absent', () => {
    assert.equal(expectationProblem({ found: 0, expected: '0' }), null);
    assert.match(expectationProblem({ found: 3, expected: '0' }), /found 3/i);
  });
});

describe('planPackages', () => {
  /* The bug this exists to stop. Two confirmed packages for one student both
     look raisable when the run starts, because neither has been written yet.
     Raising both would break the unique index on the second — or, worse in a
     run without it, leave the student holding two open requests for baskets
     they were charged for once. */
  test('only the first package of a repeated student is raised', () => {
    const shared = { _id: 'student-1', name: 'Asha', requiresParentApproval: true };
    const plans = planPackages([
      scenario({ order: { _id: 'order-1', status: 'PENDING', totalAmount: 120 }, student: shared }),
      scenario({ order: { _id: 'order-2', status: 'PENDING', totalAmount: 80 }, student: shared }),
    ]);

    assert.deepEqual(
      plans.map(({ plan }) => plan.action),
      ['REVERT', 'REFUND_ONLY']
    );
    // Both still get their money back — being second is not a reason to keep
    // a charge that should never have been taken.
    assert.match(plans[1].plan.reason, /already has a request/i);
  });

  test('different students are each raised', () => {
    const plans = planPackages([
      scenario({ student: { _id: 'student-1', name: 'Asha', requiresParentApproval: true } }),
      scenario({ student: { _id: 'student-2', name: 'Ravi', requiresParentApproval: true } }),
    ]);

    assert.deepEqual(
      plans.map(({ plan }) => plan.action),
      ['REVERT', 'REVERT']
    );
  });

  // A student whose first package was skipped has claimed nothing, so a later
  // one of theirs is still free to be raised.
  test('a skipped package does not claim its student', () => {
    const shared = { _id: 'student-1', name: 'Asha', requiresParentApproval: true };
    const plans = planPackages([
      scenario({ student: shared, transaction: null }),
      scenario({ student: shared }),
    ]);

    assert.deepEqual(
      plans.map(({ plan }) => plan.action),
      ['SKIP', 'REVERT']
    );
  });

  test('a request already open in the database still blocks the first package', () => {
    const plans = planPackages([scenario({ hasLiveRequest: true })]);

    assert.equal(plans[0].plan.action, 'REFUND_ONLY');
  });

  test('carries each package through beside its verdict', () => {
    const [entry] = planPackages([scenario()]);

    assert.equal(entry.order._id, 'order-1');
    assert.equal(entry.student.name, 'Asha');
    assert.equal(entry.parent._id, 'parent-1');
  });
});

describe('approvalItemsFrom', () => {
  /* The parent is asked to approve what was actually rung up, at the price it
     was rung up at — not today's price. chargeCart re-reads stock and price
     when they approve; this snapshot is what they are shown. */
  test('copies the charged lines exactly', () => {
    const items = approvalItemsFrom({
      items: [
        { productId, name: 'Samosa', quantity: 2, price: 60 },
        { productId, name: 'Juice', quantity: 1, price: 25 },
      ],
    });

    assert.deepEqual(items, [
      { productId, name: 'Samosa', quantity: 2, price: 60 },
      { productId, name: 'Juice', quantity: 1, price: 25 },
    ]);
  });

  // Mongoose subdocuments carry more than the four fields a pending order
  // wants; carrying the extras across would put a charge's _id on a request.
  test('carries nothing but the four fields a request needs', () => {
    const [item] = approvalItemsFrom({
      items: [{ _id: 'line-1', productId, name: 'Samosa', quantity: 2, price: 60, extra: true }],
    });

    assert.deepEqual(Object.keys(item).sort(), ['name', 'price', 'productId', 'quantity']);
  });
});
