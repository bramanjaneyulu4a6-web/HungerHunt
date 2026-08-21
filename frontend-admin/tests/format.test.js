import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { formatPackSize } = await import('../src/utils/format.js');

// The size and the unit are stored apart and only ever mean anything together,
// so joining them is done in one place rather than at each call site.
describe('formatPackSize', () => {
  test('joins the figure to the unit it is counted in', () => {
    assert.equal(formatPackSize(250, 'ml'), '250 ml');
    assert.equal(formatPackSize(150, 'g'), '150 g');
  });

  test('keeps a fractional size', () => {
    assert.equal(formatPackSize(1.5, 'L'), '1.5 L');
  });

  // An unrecorded size prints as nothing at all, never as "0 ml" — the kiosk
  // shows no line rather than claiming the packet is empty.
  for (const missing of [null, undefined, '', 0]) {
    test(`prints nothing for ${JSON.stringify(missing)}`, () => {
      assert.equal(formatPackSize(missing, 'ml'), '');
    });
  }

  // The number alone is meaningless: 250 of what? A product whose unit has not
  // loaded yet shows no size rather than a bare figure.
  test('prints nothing when there is no unit to count in', () => {
    assert.equal(formatPackSize(250, ''), '');
    assert.equal(formatPackSize(250, null), '');
  });

  test('prints nothing for a size that is not a number', () => {
    assert.equal(formatPackSize('big', 'g'), '');
  });
});
