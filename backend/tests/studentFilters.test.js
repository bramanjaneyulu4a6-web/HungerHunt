/* Narrowing the students list: by class, by section, and by whether the
 * parent has ever signed in.
 *
 * The last is the one with a trap in it. The obvious field, isParentRegistered,
 * is set by the roster import on every student it creates a parent for, so on
 * the live roll it is true for all but one of 895 and filtering by it answers
 * nothing. Activation lives on the parent, so the filter reaches across — and
 * the direction it reaches matters, which is what most of this file is about.
 *
 * No database: every model call is stubbed.
 */
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Admin = (await import('../models/Admin.js')).default;
const { signAdminToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f191e810c19729de860ed';
const ACTIVATED_CHILD = '507f191e810c19729de860a1';

let base;
let filter;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

beforeEach(() => {
  accountMatcher(Admin, ADMIN_ID)('admin');
  filter = undefined;
  mock.method(Student, 'find', (asked) => {
    filter = asked;
    const query = Promise.resolve([]);
    for (const m of ['sort', 'skip', 'limit', 'lean', 'select', 'populate']) query[m] = () => query;
    return query;
  });
});

afterEach(() => mock.restoreAll());

const list = async (query) => {
  const res = await fetch(`${base}/api/students?${query}`, {
    headers: { Authorization: `Bearer ${signAdminToken(ADMIN_ID)}` },
  });
  assert.equal(res.status, 200);
  await res.json();
  return filter;
};

describe('class and section', () => {
  test('narrow the list to exactly the value asked for', async () => {
    const applied = await list('className=VIII&section=MB%202');

    assert.equal(applied.className, 'VIII');
    assert.equal(applied.section, 'MB 2');
  });

  test('a class on its own leaves the section open', async () => {
    const applied = await list('className=IX');

    assert.equal(applied.className, 'IX');
    assert.equal('section' in applied, false);
  });

  /* The roll carries Roman and Arabic numerals for the same years, so "VIII"
     must not also match "8". Exact, not a pattern — unlike the search box. */
  test('are matched exactly, not as a pattern', async () => {
    const applied = await list('className=VIII');

    assert.equal(applied.className, 'VIII');
    assert.ok(!(applied.className instanceof RegExp));
  });

  test('blank values are ignored rather than matching students with no class', async () => {
    const applied = await list('className=&section=%20%20');

    assert.equal('className' in applied, false);
    assert.equal('section' in applied, false);
  });
});

describe('whether the parent has signed in', () => {
  // The parents who HAVE activated, which is the set the controller collects.
  const stubActivated = () =>
    mock.method(Parent, 'distinct', async (field, asked) => {
      assert.equal(field, 'studentIds');
      // Collecting the activated side, not the waiting side.
      assert.deepEqual(asked.activationRequired, { $ne: true });
      return [ACTIVATED_CHILD];
    });

  test('yes means the parent is one who has', async () => {
    stubActivated();
    const applied = await list('parentActivated=yes');

    assert.deepEqual(applied._id, { $in: [ACTIVATED_CHILD] });
  });

  /* The point of complementing the activated set rather than collecting the
     waiting one. A student whose parent row does not exist at all has nobody
     who could have signed in, and belongs on the not-activated side. Gathering
     the waiting parents would leave that student outside the list, and $nin
     would then report them as activated — the opposite of the truth. */
  test('no includes students with no parent account whatsoever', async () => {
    stubActivated();
    const applied = await list('parentActivated=no');

    assert.deepEqual(applied._id, { $nin: [ACTIVATED_CHILD] });
  });

  test('anything else is not a filter and costs no lookup', async () => {
    const distinct = mock.method(Parent, 'distinct', async () => []);

    for (const value of ['', 'maybe', 'true']) {
      const applied = await list(`parentActivated=${value}`);
      assert.equal('_id' in applied, false, `"${value}" was treated as a filter`);
    }

    assert.equal(distinct.mock.callCount(), 0);
  });
});

describe('the list with nothing asked of it', () => {
  test('is unchanged — active students, and no new keys', async () => {
    const applied = await list('');

    assert.deepEqual(applied, { active: { $ne: false } });
  });
});

describe('the filter options the dropdowns are built from', () => {
  const stubPairs = (rows) => mock.method(Student, 'aggregate', async () => rows);

  test('report the class and section pairs that really exist, with counts', async () => {
    stubPairs([
      { _id: { className: 'VIII', section: 'MB 1' }, count: 21 },
      { _id: { className: 'IX', section: '' }, count: 4 },
    ]);

    const res = await fetch(`${base}/api/students/filter-options`, {
      headers: { Authorization: `Bearer ${signAdminToken(ADMIN_ID)}` },
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body.pairs, [
      { className: 'VIII', section: 'MB 1', count: 21 },
      // Kept, not dropped: a class whose students carry no section is a real
      // answer, and losing it would make those students unreachable.
      { className: 'IX', section: '', count: 4 },
    ]);
  });

  test('drop the students who have no class at all, since no dropdown can offer it', async () => {
    stubPairs([
      { _id: { className: null, section: '' }, count: 3 },
      { _id: { className: 'X', section: 'MG' }, count: 9 },
    ]);

    const res = await fetch(`${base}/api/students/filter-options`, {
      headers: { Authorization: `Bearer ${signAdminToken(ADMIN_ID)}` },
    });
    const body = await res.json();

    assert.deepEqual(body.pairs, [{ className: 'X', section: 'MG', count: 9 }]);
  });

  test('is not reachable without an admin token', async () => {
    const res = await fetch(`${base}/api/students/filter-options`);

    assert.equal(res.status, 401);
  });
});
