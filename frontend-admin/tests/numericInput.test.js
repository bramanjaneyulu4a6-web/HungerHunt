// The office types these on a laptop keyboard where a stray letter is easy and
// invisible until a save is refused, so the stripping happens per keystroke
// rather than on submit.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { digitsOnly, numericFieldProps } = await import('../src/utils/numericInput.js');

describe('digitsOnly', () => {
  const cases = [
    ['9876543210', 10, '9876543210'],
    ['ADM-1042', 5, '1042'],
    ['98765 43210', 10, '9876543210'],
    ['+91 98765 43210', 10, '9198765432'],
    ['', 10, ''],
    ['abc', 10, ''],
    ['1.5', 10, '15'],
    // Over-long paste is truncated rather than rejected: the leading digits
    // are almost always the wanted ones, and refusing the whole paste leaves
    // the box empty with nothing said.
    ['123456789012', 10, '1234567890'],
    ['104250', 5, '10425'],
  ];

  for (const [input, max, expected] of cases) {
    test(`${JSON.stringify(input)} at max ${max} → ${JSON.stringify(expected)}`, () => {
      assert.equal(digitsOnly(input, max), expected);
    });
  }

  test('tolerates null and undefined', () => {
    assert.equal(digitsOnly(null, 5), '');
    assert.equal(digitsOnly(undefined, 5), '');
  });

  test('leaves the length alone when no maximum is given', () => {
    assert.equal(digitsOnly('123456789012345'), '123456789012345');
  });
});

describe('numericFieldProps', () => {
  test('asks for the number pad and pins the exact length', () => {
    assert.deepEqual(numericFieldProps(5), {
      type: 'text',
      inputMode: 'numeric',
      pattern: '[0-9]{5}',
      maxLength: 5,
      autoComplete: 'off',
    });
  });

  // type stays "text", not "number": a number input accepts e/E/+/-/. and
  // shows spinners that make no sense on a phone number, and its value is ''
  // for anything the browser considers invalid — which hides what was typed.
  test('never becomes a number input', () => {
    assert.equal(numericFieldProps(10).type, 'text');
  });

  test('passes an autoComplete hint through when one is given', () => {
    assert.equal(numericFieldProps(10, 'tel').autoComplete, 'tel');
  });
});
