import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLL_PAGE_SIZE, fetchAllStudents } from '../src/utils/studentRoll.js';

/* A fake of api.get that serves a roll of `total` students in pages, the way
   GET /students does when asked for a page, and records what it was asked. */
const rollOf = (total) => {
  const roll = Array.from({ length: total }, (_, index) => ({ _id: `s${index}`, name: `Student ${index}` }));
  const calls = [];
  const get = async (path, { params } = {}) => {
    calls.push({ path, params });
    const { page, limit } = params;
    const students = roll.slice((page - 1) * limit, page * limit);
    return { data: { students, total, page, pages: Math.ceil(total / limit) } };
  };
  return { roll, calls, get };
};

test('a roll larger than one page comes back whole and in order', async () => {
  const { roll, calls, get } = rollOf(ROLL_PAGE_SIZE * 2 + 52);

  const students = await fetchAllStudents(get);

  assert.equal(students.length, roll.length);
  assert.deepEqual(students.map((student) => student._id), roll.map((student) => student._id));
  assert.deepEqual(calls.map((call) => call.params.page), [1, 2, 3]);
  assert.ok(calls.every((call) => call.path === '/students' && call.params.limit === ROLL_PAGE_SIZE));
});

test('a roll that fits one page is read in one request', async () => {
  const { calls, get } = rollOf(12);

  const students = await fetchAllStudents(get);

  assert.equal(students.length, 12);
  assert.equal(calls.length, 1);
});

test('an empty roll is an empty list, not an error', async () => {
  const { get } = rollOf(0);

  assert.deepEqual(await fetchAllStudents(get), []);
});

test('the page size never exceeds what the server will serve', () => {
  assert.ok(ROLL_PAGE_SIZE <= 500);
});
