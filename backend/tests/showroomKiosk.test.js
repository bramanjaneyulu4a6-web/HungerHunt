/* The kiosk catalogue as a showroom account receives it.
 *
 * A demonstration account is shown one category of photographed items instead
 * of the whole shelf — see utils/showroomCatalogue.js for why. This file holds
 * the endpoint end of that: that the narrowing happens, that it is narrower
 * than the ordinary rules rather than merely different, and above all that an
 * ordinary student's payload is not touched by any of it.
 */
import test, { describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const StockGroup = (await import('../models/StockGroup.js')).default;
const { signStudentToken } = await import('../utils/tokens.js');
const { showroomStudent } = await import('../utils/showroomCatalogue.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f1f77bcf86cd799439022';
const GROUP_ID = '507f1f77bcf86cd799439033';
const DEMO_PHONE = '7995601391';

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

const originalDemoPhones = process.env.DEMO_PARENT_PHONES;

afterEach(() => {
  mock.restoreAll();
  showroomToken = false;
  process.env.DEMO_PARENT_PHONES = originalDemoPhones ?? '';
});

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  query.sort = () => query;
  query.lean = () => query;
  return query;
};

/* A shelf row as Inventory.find returns it: the populated product, with the
   populated category hanging off it, exactly as the controller reads them. */
const row = (name, { category = 'Snacks', image = 'https://res.cloudinary.com/x/a.jpg', ...extra } = {}) => {
  const doc = {
    stock: 10,
    productId: {
      _id: `id-${name}`,
      name,
      price: 20,
      active: true,
      image,
      stockGroup: { _id: GROUP_ID, name: category, active: true },
      ...extra,
    },
  };
  return { ...doc, toObject: () => doc };
};

/* No category carries a purchase cap in production, so the caps loader finds
   nothing. Mocked rather than left to the database: the controller asks for
   allowances on every student read, and an unmocked query would hang. */
const shelfOf = (...rows) => {
  mock.method(StockGroup, 'find', () => queryFor([]));
  return mock.method(Inventory, 'find', () => queryFor(rows));
};

/* Whether this is a showroom account is settled when the kiosk session is
   minted and carried in the token, so the catalogue costs no extra read — see
   createKioskSession. These tests therefore sign the token the session would
   have handed out rather than mocking a lookup the controller never makes. */
let showroomToken = false;

const signedInAs = (student) => {
  mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
  showroomToken = showroomStudent(student);
};

const asStudent = () =>
  fetch(`${base}/api/inventory`, {
    headers: {
      Authorization: `Bearer ${signStudentToken(STUDENT_ID, 'ADM-1042', 900, {
        showroom: showroomToken,
      })}`,
    },
  });

const namesIn = async (res) =>
  (await res.json()).map((item) => item.productId?.name).filter(Boolean);

// The shelf every test below draws from: both other categories, an Essentials
// item with a picture, and an Essentials item without one.
const mixedShelf = () =>
  shelfOf(
    row('Oreo', { category: 'Snacks' }),
    row('Pepsi', { category: 'Drinks' }),
    row('Notebook - Black', { category: 'Essentials' }),
    row('Pencils', { category: 'Essentials', image: '' })
  );

describe('a showroom account at the kiosk', () => {
  test('is shown only the photographed Essentials', async () => {
    signedInAs({ demoAccount: true });
    mixedShelf();

    assert.deepEqual(await namesIn(await asStudent()), ['Notebook - Black']);
  });

  test("the demo parent's child is shown the same", async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    signedInAs({ parentPhoneNumber: DEMO_PHONE });
    mixedShelf();

    assert.deepEqual(await namesIn(await asStudent()), ['Notebook - Black']);
  });

  /* The decision behind this feature: the four Essentials products in
     production are all kioskVisible:false, so honouring that flag would leave
     the showroom with an empty screen and the kiosk's technical-difficulties
     card. The showroom trades that switch for a narrower rule of its own. */
  test('sees an Essentials item the kiosk switch has hidden', async () => {
    signedInAs({ demoAccount: true });
    shelfOf(row('Notebook - Black', { category: 'Essentials', kioskVisible: false }));

    assert.deepEqual(await namesIn(await asStudent()), ['Notebook - Black']);
  });

  // Withdrawal outranks the shop window. An archived product is off sale
  // everywhere, and a demo is not a reason to put one back on a screen.
  test('never sees an archived product', async () => {
    signedInAs({ demoAccount: true });
    shelfOf(row('Notebook - Black', { category: 'Essentials', active: false }));

    assert.deepEqual(await namesIn(await asStudent()), []);
  });

  // Likewise the category switch: if Essentials itself is closed, the showroom
  // is empty rather than exempt.
  test('never sees a product from a closed category', async () => {
    signedInAs({ demoAccount: true });
    shelfOf(
      row('Notebook - Black', {
        category: 'Essentials',
        stockGroup: { _id: GROUP_ID, name: 'Essentials', active: false },
      })
    );

    assert.deepEqual(await namesIn(await asStudent()), []);
  });
});

describe('an ordinary student at the kiosk', () => {
  /* The test this file exists for. Everything above changes a screen; this one
     proves whose screen it is not. */
  test('still sees the whole shelf, Essentials excluded as before', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    signedInAs({ demoAccount: false, parentPhoneNumber: '9876543210' });
    mixedShelf();

    // Alphabetical: the controller sorts the shelf by product name so every
    // screen reading it agrees on the order.
    assert.deepEqual(await namesIn(await asStudent()), [
      'Notebook - Black',
      'Oreo',
      'Pencils',
      'Pepsi',
    ]);
  });

  test('is still refused a product the kiosk switch has hidden', async () => {
    signedInAs({ demoAccount: false, parentPhoneNumber: '9876543210' });
    shelfOf(row('Oreo'), row('Pepsi', { kioskVisible: false }));

    assert.deepEqual(await namesIn(await asStudent()), ['Oreo']);
  });

  // A picture is a showroom rule, never a selling rule. Real children buy
  // unphotographed food every day.
  test('is not refused a product for having no picture', async () => {
    signedInAs({ demoAccount: false, parentPhoneNumber: '9876543210' });
    shelfOf(row('Samosa', { image: '' }));

    assert.deepEqual(await namesIn(await asStudent()), ['Samosa']);
  });

  /* A student row that cannot be read must not promote anybody. The catalogue
     falls back to the ordinary rules rather than the shop window. */
  test('a student record that has gone is treated as ordinary', async () => {
    signedInAs(null);
    mixedShelf();

    // Alphabetical: the controller sorts the shelf by product name so every
    // screen reading it agrees on the order.
    assert.deepEqual(await namesIn(await asStudent()), [
      'Notebook - Black',
      'Oreo',
      'Pencils',
      'Pepsi',
    ]);
  });
});
