import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { classesFrom, sectionsFor } from '../src/utils/studentFilterOptions.js';

const ROLL = [
  { className: 'VIII', section: 'MB 1', count: 21 },
  { className: 'VIII', section: 'MB 2', count: 19 },
  { className: 'VIII', section: '', count: 2 },
  { className: 'IX', section: 'MG', count: 14 },
  { className: '8', section: 'A1', count: 3 },
];

describe('the class dropdown', () => {
  test('lists each class once', () => {
    assert.deepEqual(classesFrom(ROLL), ['VIII', 'IX', '8']);
  });

  /* The roll really does carry both spellings for the same year group. They
     are kept apart because they are separate values in the database: folding
     them together here would offer a filter that the server cannot honour. */
  test('keeps "VIII" and "8" apart rather than guessing they are the same year', () => {
    const classes = classesFrom(ROLL);

    assert.ok(classes.includes('VIII'));
    assert.ok(classes.includes('8'));
  });

  test('leaves the server order alone instead of imposing one of its own', () => {
    // VIII before IX before 8 — the order it arrived in, not alphabetical
    // ("8" would sort first) and not numeric (nothing here is a number).
    assert.deepEqual(classesFrom(ROLL), ['VIII', 'IX', '8']);
  });

  test('survives a missing or empty roll', () => {
    assert.deepEqual(classesFrom(), []);
    assert.deepEqual(classesFrom([]), []);
    assert.deepEqual(classesFrom([{ section: 'MB 1' }]), []);
  });
});

describe('the section dropdown', () => {
  test('offers only the sections of the class in hand', () => {
    assert.deepEqual(sectionsFor(ROLL, 'VIII'), ['MB 1', 'MB 2']);
    assert.deepEqual(sectionsFor(ROLL, 'IX'), ['MG']);
  });

  /* Without this the control would list all fifteen sections on the roll, and
     picking IX + A1 would empty the table for a reason the screen never gives. */
  test('does not leak one class\'s sections into another', () => {
    assert.equal(sectionsFor(ROLL, 'IX').includes('MB 1'), false);
    assert.equal(sectionsFor(ROLL, 'VIII').includes('A1'), false);
  });

  test('is empty until a class is chosen, which is what disables the control', () => {
    assert.deepEqual(sectionsFor(ROLL, ''), []);
    assert.deepEqual(sectionsFor(ROLL, undefined), []);
  });

  // "All of class VIII" is already the empty option; a blank section would be
  // a second, unnamed way of saying it.
  test('drops the blank section rather than showing a nameless option', () => {
    assert.deepEqual(sectionsFor(ROLL, 'VIII'), ['MB 1', 'MB 2']);
  });

  test('a class nobody is in has no sections', () => {
    assert.deepEqual(sectionsFor(ROLL, 'XII'), []);
  });
});
