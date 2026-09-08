// Grade / class ("9-B") becomes two fields: className and section. The old
// grade field stays on the schema, deprecated, so documents the migration has
// not reached yet still read and save; splitGrade is the one rule for turning
// a combined value into the pair, shared by the migration script and any
// legacy fallback.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Room = (await import('../models/Room.js')).default;
const Student = (await import('../models/Student.js')).default;
const { splitGrade } = await import('../utils/studentClass.js');
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);
const STAFF_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f191e810c19729de860e1';
const token = signStaffToken(STAFF_ID, 'admin');
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const authenticate = () => mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
const post = (path, body) => fetch(base + path, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const put = (path, body) => fetch(base + path, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('splitGrade', () => {
  test('splits a combined value on its last hyphen', () => {
    assert.deepEqual(splitGrade('9-B'), { className: '9', section: 'B' });
    assert.deepEqual(splitGrade('LKG-A'), { className: 'LKG', section: 'A' });
  });

  test('a value with no hyphen is all class', () => {
    assert.deepEqual(splitGrade('10'), { className: '10', section: '' });
  });

  test('whitespace around the hyphen is not part of either half', () => {
    assert.deepEqual(splitGrade(' 9 - B '), { className: '9', section: 'B' });
  });

  test('blank in, blank out', () => {
    assert.deepEqual(splitGrade(''), { className: '', section: '' });
    assert.deepEqual(splitGrade(undefined), { className: '', section: '' });
  });
});

describe('the Student schema', () => {
  const base = {
    name: 'Asha',
    fatherName: 'Dev',
    roomNumber: 'D-4',
    roomId: ROOM_ID,
    admissionNumber: '10425',
    parentPhoneNumber: '9000000001',
  };

  test('a new student needs a class but not a section or a grade', () => {
    const missingClass = new Student(base).validateSync();
    assert.match(missingClass.errors.className.message, /required/i);

    const complete = new Student({ ...base, className: '9' }).validateSync();
    assert.equal(complete, undefined);
  });

  test('a pre-migration document still saves without a class', () => {
    const legacy = new Student({ ...base, grade: '9-B' });
    legacy.isNew = false;
    assert.equal(legacy.validateSync(), undefined);
  });
});

describe('student writes', () => {
  test('creation carries class and section through', async () => {
    authenticate();
    mock.method(Room, 'findOne', () => ({ lean: async () => ({ _id: ROOM_ID, code: 'D-4', active: true }) }));
    let created;
    mock.method(Student, 'create', async (doc) => {
      created = doc;
      return { _id: '507f191e810c19729de860e2', ...doc };
    });
    mock.method(Student, 'find', async () => []);

    const response = await post('/api/students', {
      name: 'Asha', fatherName: 'Dev', roomNumber: 'D-4',
      className: '9', section: 'B',
      admissionNumber: '10425', parentPhoneNumber: '9000000001',
    });

    assert.equal(response.status, 201);
    assert.equal(created.className, '9');
    assert.equal(created.section, 'B');
    assert.equal(created.grade, undefined);
  });

  test('an update can correct class and section', async () => {
    authenticate();
    let update;
    mock.method(Student, 'findOneAndUpdate', async (filter, doc) => {
      update = doc;
      return { _id: '507f191e810c19729de860e2', ...doc };
    });
    mock.method(Student, 'find', async () => []);

    const response = await put('/api/students/507f191e810c19729de860e2', {
      className: '10', section: 'C',
    });

    assert.equal(response.status, 200);
    assert.equal(update.className, '10');
    assert.equal(update.section, 'C');
  });

  test('bulk import requires a class and accepts a legacy grade column as one', async () => {
    authenticate();
    mock.method(Room, 'find', () => ({ lean: async () => [{ _id: ROOM_ID, code: 'D-4', active: true }] }));
    mock.method(Student, 'find', () => ({ lean: async () => [] }));
    mock.method(Student, 'insertMany', async () => { throw new Error('must not insert'); });

    const student = { name: 'Asha', admissionNumber: '10425', fatherName: 'Dev', roomNumber: 'D-4', parentPhoneNumber: '9000000001' };
    const response = await post('/api/students/bulk', {
      students: [
        student,
        { ...student, name: 'Ben', admissionNumber: '10426', grade: '9-B' },
      ],
    });

    const body = await response.json();
    assert.equal(response.status, 400);
    // Only the first row is wrong: the second's grade column became its class.
    assert.deepEqual(body.invalidCells, [{
      row: 2,
      column: 'className',
      cell: 'className (row 2)',
      message: 'Class is required.',
    }]);
  });

  test('a bulk import with classes lands them on the inserted rows', async () => {
    authenticate();
    mock.method(Room, 'find', () => ({ lean: async () => [{ _id: ROOM_ID, code: 'D-4', active: true }] }));
    // Both read shapes this route uses: the duplicate check's .lean() and
    // findStudentsByIdentity's .select().
    mock.method(Student, 'find', () => ({ lean: async () => [], select: async () => [] }));
    let inserted;
    mock.method(Student, 'insertMany', async (rows) => {
      inserted = rows;
      return rows;
    });

    const response = await post('/api/students/bulk', {
      students: [{
        name: 'Asha', admissionNumber: '10425', fatherName: 'Dev', roomNumber: 'D-4',
        className: '9', section: 'B', parentPhoneNumber: '9000000001',
      }],
    });

    assert.equal(response.status, 201);
    assert.equal(inserted[0].className, '9');
    assert.equal(inserted[0].section, 'B');
  });
});
