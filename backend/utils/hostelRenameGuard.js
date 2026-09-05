/* TEMPORARY — delete this file, its test, and the call in server.js once every
   environment has run scripts/migrateHostelsToRooms.js.

   The hostel→room rename is a rename of collections and fields, not an additive
   change: this backend only knows "rooms". Booting it against a database that
   still holds "hostels" does not fail loudly — Mongoose's autoIndex quietly
   creates an EMPTY "rooms" collection, so every room, every student's room and
   every caretaker assignment simply reads as absent, and the first sign of
   trouble is a user report. Worse, the empty collection it leaves behind is the
   exact collision the migration script then has to be talked past.

   So the wrong deploy order is refused here rather than merely detected later. */

export const HOSTEL_MIGRATION_REQUIRED = [
  'FATAL: this database still has a "hostels" collection, so the hostel→room migration has not run.',
  'Refusing to start: serving traffic now would show empty rooms and unassigned caretakers.',
  'Required order: stop the backend → run `node scripts/migrateHostelsToRooms.js` against this',
  'database → deploy this backend → redeploy the frontends. See docs/rollout-hostel-to-room.md.',
].join(' ');

/* True when the legacy collection is still present. A fresh install that never
   had "hostels" and a fully migrated database both answer false. */
export const hasLegacyHostelCollection = async (db) => {
  const found = await db.listCollections({ name: 'hostels' }).toArray();
  return found.length > 0;
};
