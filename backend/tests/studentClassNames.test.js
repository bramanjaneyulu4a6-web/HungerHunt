/* Class names are numbers, whatever the spreadsheet spells them as.
 *
 * The rule is narrow on purpose. This roll carries "MB", "MG" and "MINDS" as
 * real section values, and a Roman-numeral parser would happily read letters
 * out of all three. The table converts twelve known class names and is blind
 * to everything else.
 */
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const { normalizeClassName, splitGrade } = await import('../utils/studentClass.js');
const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Admin = (await import('../models/Admin.js')).default;
const { signAdminToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f191e810c19729de860ed';
const STUDENT_ID = '507f191e810c19729de860eb';

describe('Roman class names become numbers', () => {
  test('the five the roll actually uses', () => {
    assert.equal(normalizeClassName('VI'), '6');
    assert.equal(normalizeClassName('VII'), '7');
    assert.equal(normalizeClassName('VIII'), '8');
    assert.equal(normalizeClassName('IX'), '9');
    assert.equal(normalizeClassName('X'), '10');
  });

  test('and the rest of the school, so a younger year does not reintroduce them', () => {
    assert.equal(normalizeClassName('I'), '1');
    assert.equal(normalizeClassName('IV'), '4');
    assert.equal(normalizeClassName('XII'), '12');
  });

  test('however they are typed', () => {
    assert.equal(normalizeClassName(' viii '), '8');
    assert.equal(normalizeClassName('Ix'), '9');
  });

  test('a class already written as a number is left exactly as it is', () => {
    for (const value of ['1', '5', '8', '10']) {
      assert.equal(normalizeClassName(value), value);
    }
  });
});

describe('what it must not touch', () => {
  /* Every one of these is a real value in this roll, and every one is made of
     letters a Roman-numeral parser would find digits in. This is the reason
     the conversion is a table and not a parser. */
  test('section-like names made of numeral letters survive intact', () => {
    for (const value of ['MB', 'MG', 'MINDS', 'MB 1', 'MAP BOYS']) {
      assert.equal(normalizeClassName(value), value);
    }
  });

  test('non-numeric class names the school may use survive intact', () => {
    for (const value of ['LKG', 'UKG', 'Demo', 'Nursery']) {
      assert.equal(normalizeClassName(value), value);
    }
  });

  test('nothing at all stays nothing rather than becoming a class', () => {
    assert.equal(normalizeClassName(''), '');
    assert.equal(normalizeClassName(null), '');
    assert.equal(normalizeClassName(undefined), '');
    assert.equal(normalizeClassName('   '), '');
  });
});

describe('it leaves splitGrade alone', () => {
  test('the retired combined value still splits the way it always did', () => {
    assert.deepEqual(splitGrade('IX-MB 1'), { className: 'IX', section: 'MB 1' });
    assert.deepEqual(splitGrade('10'), { className: '10', section: '' });
  });
});


/* The rule has to hold at the door as well as in the migration, or the roll
   drifts back the first time somebody types a class the way the sheet spells
   it. Every admin write goes through pickWritable, so that is where it lives
   and this is the route that proves it. */
describe('the admin routes store what the migration would have stored', () => {
  let base;
  let update;

  before(async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
  });

  beforeEach(() => {
    accountMatcher(Admin, ADMIN_ID)('admin');
    update = undefined;
    mock.method(Student, 'findOneAndUpdate', async (filter, changes) => {
      update = changes;
      return { _id: STUDENT_ID, name: 'Asha Rao' };
    });
    mock.method(Student, 'find', () => {
      const query = Promise.resolve([]);
      for (const m of ['sort', 'skip', 'limit', 'lean', 'select']) query[m] = () => query;
      return query;
    });
    mock.method(Parent, 'find', () => {
      const query = Promise.resolve([]);
      for (const m of ['sort', 'limit', 'lean', 'select']) query[m] = () => query;
      return query;
    });
    mock.method(Parent, 'updateMany', async () => ({}));
  });

  afterEach(() => mock.restoreAll());

  const edit = async (body) => {
    const res = await fetch(`${base}/api/students/${STUDENT_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signAdminToken(ADMIN_ID)}`,
      },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200);
    return update;
  };

  test('a class typed in Roman numerals is stored as a number', async () => {
    assert.equal((await edit({ className: 'VIII' })).className, '8');
    assert.equal((await edit({ className: 'ix' })).className, '9');
  });

  test('a class already a number is stored unchanged', async () => {
    assert.equal((await edit({ className: '7' })).className, '7');
  });

  test('a class that is not a year is left alone', async () => {
    assert.equal((await edit({ className: 'LKG' })).className, 'LKG');
  });

  test('the section beside it is untouched, numerals or not', async () => {
    const applied = await edit({ className: 'X', section: 'MB 1' });

    assert.equal(applied.className, '10');
    // "MB" is made of numeral letters and is a real section on this roll.
    assert.equal(applied.section, 'MB 1');
  });
});

/* The read side is forgiving for the same reason the write side is strict:
   links and bookmarks made before the migration still name classes the old
   way, and should still find their students rather than an empty table. */
describe('filtering by a class named the old way', () => {
  test('finds the students it always meant', () => {
    assert.equal(normalizeClassName('VIII'), '8');
  });
});
