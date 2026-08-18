import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const Hostel = (await import('../models/Hostel.js')).default;
const { loginAdmin } = await import('../controllers/adminController.js');

const STAFF_ID = '507f1f77bcf86cd799439011';
const HOSTEL_ID = '507f191e810c19729de860e1';

afterEach(() => mock.restoreAll());

test('every staff role requires a name and phone number', () => {
  for (const role of ['admin', 'warehouse', 'caretaker']) {
    const account = new Admin({
      email: `${role}@example.com`, password: 'password', role,
      ...(role === 'caretaker' ? { hostelId: HOSTEL_ID } : {}),
    });
    const errors = account.validateSync().errors;
    assert.match(errors.name.message, /required/i);
    assert.match(errors.phone.message, /required/i);
  }
});

test('caretaker login returns identity and a readable hostel', async () => {
  const password = 'caretaker-password';
  const hash = await bcrypt.hash(password, 4);
  mock.method(Admin, 'findOne', async () => ({
    _id: STAFF_ID,
    name: 'Meera Nair',
    phone: '9876543210',
    email: 'd4.caretaker@example.com',
    password: hash,
    role: 'caretaker',
    hostelId: HOSTEL_ID,
  }));
  mock.method(Hostel, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: HOSTEL_ID, code: 'D-4', name: 'East Residence' }),
    }),
  }));

  let status = 200;
  let body;
  const res = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  await loginAdmin({ body: { email: ' D4.CARETAKER@example.com ', password } }, res);

  assert.equal(status, 200);
  assert.deepEqual(body.staff, {
    name: 'Meera Nair',
    phone: '9876543210',
    email: 'd4.caretaker@example.com',
    role: 'caretaker',
    hostel: { id: HOSTEL_ID, code: 'D-4', name: 'East Residence' },
  });
  assert.equal(body.hostelId, HOSTEL_ID);
  assert.equal(typeof body.token, 'string');
});
