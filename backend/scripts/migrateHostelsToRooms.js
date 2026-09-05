// Renames the hostel concept to room in an existing database. Idempotent:
// every stage skips what is already converted.
import mongoose from 'mongoose';
import 'dotenv/config';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  /* The Room model declares indexes and Mongoose builds them on boot, so a backend
     that starts before or during this run creates an EMPTY `rooms` collection. The
     old code read that as "already migrated" and skipped the rename in silence,
     leaving every room orphaned in `hostels` with no error anywhere. So: rename,
     drop-then-rename when the collision is empty, and refuse loudly when it is not. */
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  if (names.includes('hostels')) {
    if (names.includes('rooms')) {
      const strays = await db.collection('rooms').countDocuments();
      if (strays > 0) {
        throw new Error(
          `Both "hostels" (${await db.collection('hostels').countDocuments()} documents) and "rooms" ` +
          `(${strays} documents) hold data. This script will not guess which is authoritative. ` +
          'Stop the backend, reconcile the two collections by hand, and run this again.'
        );
      }
      // Empty: the index-only collection a booting backend leaves behind.
      console.log('dropping the empty "rooms" collection a running backend created');
      await db.collection('rooms').drop();
    }
    await db.renameCollection('hostels', 'rooms');
    console.log('renamed "hostels" to "rooms"');
  } else {
    console.log('no "hostels" collection: the rename is already done');
  }

  await db.collection('students').updateMany(
    { hostelId: { $exists: true } },
    { $rename: { hostelId: 'roomId', hostelNumber: 'roomNumber' } }
  );

  const admins = db.collection('admins');
  const caretakers = await admins.find({ hostelId: { $exists: true } }).toArray();
  for (const account of caretakers) {
    await admins.updateOne(
      { _id: account._id },
      {
        ...(account.hostelId ? { $set: { roomIds: [account.hostelId] } } : {}),
        $unset: { hostelId: '' },
      }
    );
  }

  await db.collection('fulfillmentorders').updateMany(
    { 'studentSnapshot.hostelId': { $exists: true } },
    { $rename: {
      'studentSnapshot.hostelId': 'studentSnapshot.roomId',
      'studentSnapshot.hostelNumber': 'studentSnapshot.roomNumber',
    } }
  );
  const orders = db.collection('fulfillmentorders');
  /* Listing indexes on a collection that does not exist throws NamespaceNotFound
     (26), which used to abort the run AFTER the rename had already happened —
     an environment with no orders yet could never finish, and the operator was
     left staring at a stack trace over a migration that had in fact worked. */
  const orderIndexes = await orders.indexes().catch((error) => {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  });
  for (const index of orderIndexes) {
    if (JSON.stringify(index.key).includes('hostelId')) await orders.dropIndex(index.name);
  }

  const reports = db.collection('staffreports');
  const staffReports = await reports.find({ hostelId: { $exists: true } }).toArray();
  for (const report of staffReports) {
    await reports.updateOne(
      { _id: report._id },
      {
        ...(report.hostelId ? { $set: { roomIds: [report.hostelId] } } : {}),
        $unset: { hostelId: '' },
      }
    );
  }
  await reports.updateMany(
    { 'raiser.hostelNumber': { $exists: true } },
    { $rename: { 'raiser.hostelNumber': 'raiser.roomNumbers' } }
  );
  await reports.updateMany(
    { 'order.hostelNumber': { $exists: true } },
    { $rename: { 'order.hostelNumber': 'order.roomNumber' } }
  );

  console.log('rooms:', await db.collection('rooms').countDocuments());
  console.log('students missing roomId:', await db.collection('students').countDocuments({ roomId: { $exists: false } }));
  console.log('caretakers missing roomIds:', await admins.countDocuments({ role: 'caretaker', $or: [{ roomIds: { $exists: false } }, { roomIds: { $size: 0 } }] }));
  console.log('orders missing snapshot roomId:', await orders.countDocuments({ 'studentSnapshot.roomId': { $exists: false } }));

  /* Last word: a surviving "hostels" collection means a backend recreated it mid-run
     (or the rename never happened). Fail rather than print healthy-looking counts. */
  const finalNames = (await db.listCollections().toArray()).map((c) => c.name);
  if (finalNames.includes('hostels')) {
    await mongoose.disconnect();
    throw new Error(
      'A "hostels" collection still exists after the migration. The backend is probably still ' +
      'running and recreating it. Stop it, verify the data in "rooms", and run this again.'
    );
  }
  await mongoose.disconnect();
};

run().catch((error) => { console.error(error); process.exit(1); });
