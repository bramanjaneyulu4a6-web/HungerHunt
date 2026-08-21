import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { WIZARD_STEPS, stepProblem, firstUnfinishedStep, canReachStep, chargedPrice } = await import(
  '../src/constants/productWizard.js'
);

// Everything a saved product needs, so each test can spoil exactly one field.
const COMPLETE = {
  name: 'Oreo 52g',
  stockGroup: 'group-snacks',
  subCategory: 'Biscuits & Cookies',
  unit: 'unit-g',
  mrp: '20',
  discountRate: '0',
  packSize: '',
  reorderLevel: '5',
  safetyStock: '0',
  purchaseLimitEnabled: false,
  purchaseLimitQuantity: '',
  purchaseLimitPeriod: 'DAILY',
};

const withForm = (overrides) => ({ ...COMPLETE, ...overrides });

describe('step 1 — basics', () => {
  test('passes when named and filed', () => {
    assert.equal(stepProblem(0, COMPLETE), '');
  });

  const cases = [
    [{ name: '' }, 'Give the product a name.'],
    [{ name: '   ' }, 'Give the product a name.'],
    [{ stockGroup: '' }, 'Choose a category.'],
    [{ subCategory: '' }, 'Choose a sub-category.'],
  ];

  for (const [overrides, expected] of cases) {
    test(`${JSON.stringify(overrides)} → ${expected}`, () => {
      assert.equal(stepProblem(0, withForm(overrides)), expected);
    });
  }
});

describe('step 2 — price and unit', () => {
  test('passes with a unit and an MRP above zero', () => {
    assert.equal(stepProblem(1, COMPLETE), '');
  });

  test('refuses a missing unit', () => {
    assert.equal(
      stepProblem(1, withForm({ unit: '' })),
      'Choose the unit this is measured in.'
    );
  });

  // The till reads a zero price as free and hands the goods over, and the MRP
  // is what the price is computed from — so this is the one rule here that is
  // about money leaving the building.
  for (const mrp of ['', '0', '0.00', '-5', 'free']) {
    test(`refuses an MRP of ${JSON.stringify(mrp)}`, () => {
      assert.equal(
        stepProblem(1, withForm({ mrp })),
        'Enter an MRP above ₹0.'
      );
    });
  }

  test('accepts the smallest MRP the server allows', () => {
    assert.equal(stepProblem(1, withForm({ mrp: '0.01' })), '');
  });

  // Blank means no discount, which is the common case and should not stop the
  // office moving on. A typed nonsense value is a different thing and does.
  test('a blank discount is no discount, not an error', () => {
    assert.equal(stepProblem(1, withForm({ discountRate: '' })), '');
  });

  test('accepts a fractional discount', () => {
    assert.equal(stepProblem(1, withForm({ discountRate: '12.5' })), '');
  });

  // 100% prices the product at nothing, which the till reads as free. The
  // server refuses it outright, so the form says so at the box.
  for (const rate of ['100', '150', '-5', 'half']) {
    test(`refuses a discount of ${JSON.stringify(rate)}`, () => {
      assert.equal(
        stepProblem(1, withForm({ discountRate: rate })),
        'Enter a discount from 0% to under 100%.'
      );
    });
  }
  // Optional, so a blank box moves on. A typed figure still has to be a real
  // one — the server refuses zero and the office should hear it at the box.
  test('a blank pack size is not an error', () => {
    assert.equal(stepProblem(1, withForm({ packSize: '' })), '');
  });

  test('accepts a pack size', () => {
    assert.equal(stepProblem(1, withForm({ packSize: '250' })), '');
  });

  test('accepts a fractional pack size', () => {
    assert.equal(stepProblem(1, withForm({ packSize: '1.5' })), '');
  });

  for (const size of ['0', '-5', 'big']) {
    test(`refuses a pack size of ${JSON.stringify(size)}`, () => {
      assert.equal(
        stepProblem(1, withForm({ packSize: size })),
        'Enter a pack size above 0, or leave it blank.'
      );
    });
  }
});

// What the office types and what the student pays are two different numbers,
// and the form shows the second before the save so a discount that rounds
// away to nothing is visible rather than discovered at the till.
describe('the price the student pays', () => {
  test('is the MRP when nothing is taken off', () => {
    assert.equal(chargedPrice(withForm({ mrp: '27', discountRate: '0' })), 27);
  });

  test('is a blank discount treated as none', () => {
    assert.equal(chargedPrice(withForm({ mrp: '27', discountRate: '' })), 27);
  });

  test('rounds up to the next whole rupee', () => {
    assert.equal(chargedPrice(withForm({ mrp: '27', discountRate: '15' })), 23);
  });

  test('is null when the MRP is not yet a usable number', () => {
    assert.equal(chargedPrice(withForm({ mrp: '' })), null);
    assert.equal(chargedPrice(withForm({ mrp: '0' })), null);
  });

  test('is null when the discount is not a usable rate', () => {
    assert.equal(chargedPrice(withForm({ discountRate: '100' })), null);
  });
});

describe('step 3 — stock', () => {
  test('accepts zero for both, which is a real answer', () => {
    assert.equal(stepProblem(2, withForm({ reorderLevel: '0', safetyStock: '0' })), '');
  });

  // Blank is an unanswered question, not a zero — both fields have a
  // meaningful 0 ("never flag", "no buffer"), so the two must stay distinct.
  test('refuses a blank reorder level', () => {
    assert.equal(
      stepProblem(2, withForm({ reorderLevel: '' })),
      'Enter a reorder level of 0 or more.'
    );
  });

  test('refuses a blank safety stock', () => {
    assert.equal(
      stepProblem(2, withForm({ safetyStock: '' })),
      'Enter a safety stock of 0 or more.'
    );
  });

  test('refuses negatives and nonsense', () => {
    assert.notEqual(stepProblem(2, withForm({ reorderLevel: '-1' })), '');
    assert.notEqual(stepProblem(2, withForm({ safetyStock: 'lots' })), '');
  });
});

describe('step 4 — extras', () => {
  test('is finished by default, because everything on it is optional', () => {
    assert.equal(stepProblem(3, COMPLETE), '');
  });

  test('ignores a stale quantity while the limit is switched off', () => {
    assert.equal(stepProblem(3, withForm({ purchaseLimitQuantity: '0' })), '');
  });

  // A product nobody may buy is an archived product; the server refuses this
  // too, so catching it here saves a rejected save.
  for (const quantity of ['', '0']) {
    test(`refuses an enabled limit of ${JSON.stringify(quantity)}`, () => {
      assert.equal(
        stepProblem(3, withForm({ purchaseLimitEnabled: true, purchaseLimitQuantity: quantity })),
        'A per-student limit must be at least 1, or switch the limit off.'
      );
    });
  }

  test('accepts an enabled limit of 1', () => {
    assert.equal(
      stepProblem(3, withForm({ purchaseLimitEnabled: true, purchaseLimitQuantity: '1' })),
      ''
    );
  });
});

describe('firstUnfinishedStep', () => {
  test('is -1 when the product is ready to save', () => {
    assert.equal(firstUnfinishedStep(COMPLETE), -1);
  });

  test('points at the earliest gap, not the last one typed', () => {
    assert.equal(firstUnfinishedStep(withForm({ name: '', price: '' })), 0);
  });

  test('finds a gap on a later step', () => {
    assert.equal(firstUnfinishedStep(withForm({ safetyStock: '' })), 2);
  });

  test('finds a gap on the optional step', () => {
    assert.equal(
      firstUnfinishedStep(withForm({ purchaseLimitEnabled: true, purchaseLimitQuantity: '' })),
      3
    );
  });
});

describe('canReachStep', () => {
  test('the first step is always reachable, however empty the form', () => {
    assert.equal(canReachStep(0, { ...COMPLETE, name: '', stockGroup: '', subCategory: '' }), true);
  });

  test('a complete product opens every step, which is what edit mode relies on', () => {
    for (let index = 0; index < WIZARD_STEPS.length; index += 1) {
      assert.equal(canReachStep(index, COMPLETE), true, `step ${index + 1}`);
    }
  });

  test('an unnamed product cannot skip ahead', () => {
    const blank = withForm({ name: '' });
    assert.equal(canReachStep(1, blank), false);
    assert.equal(canReachStep(3, blank), false);
  });

  // Only the steps *before* the target have to be settled — an unfinished
  // step 3 must not lock step 3 itself.
  test('a gap does not lock the step the gap is on', () => {
    const noBuffer = withForm({ safetyStock: '' });
    assert.equal(canReachStep(2, noBuffer), true);
    assert.equal(canReachStep(3, noBuffer), false);
  });
});
