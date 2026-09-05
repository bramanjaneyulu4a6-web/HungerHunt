/* The deploy-order guard for the hostel→room rename.
 *
 * server.js runs its work on import, so the check itself lives in a util and is
 * exercised here; server.js does nothing with it but print the message and exit
 * non-zero before app.listen. Delete this file with the guard once every
 * environment has migrated. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { HOSTEL_MIGRATION_REQUIRED, hasLegacyHostelCollection } = await import(
  '../utils/hostelRenameGuard.js'
);

// listCollections({ name }) is a filtered cursor, which is how the driver
// answers "does this one collection exist" without listing the database.
const fakeDb = (names) => ({
  listCollections: (filter) => ({
    toArray: async () => names
      .filter((name) => (filter?.name ? name === filter.name : true))
      .map((name) => ({ name })),
  }),
});

describe('hasLegacyHostelCollection', () => {
  test('a database that never migrated still has "hostels"', async () => {
    assert.equal(await hasLegacyHostelCollection(fakeDb(['hostels', 'students', 'admins'])), true);
  });

  // The half-migrated shape: a backend booted first, autoIndex made an empty
  // "rooms", and the real data is still in "hostels". Booting must still refuse.
  test('an empty "rooms" beside "hostels" does not count as migrated', async () => {
    assert.equal(await hasLegacyHostelCollection(fakeDb(['hostels', 'rooms'])), true);
  });

  test('a fully migrated database is clean', async () => {
    assert.equal(await hasLegacyHostelCollection(fakeDb(['rooms', 'students', 'admins'])), false);
  });

  test('a fresh install with no collections at all is clean', async () => {
    assert.equal(await hasLegacyHostelCollection(fakeDb([])), false);
  });
});

describe('HOSTEL_MIGRATION_REQUIRED', () => {
  // Whoever reads this line is mid-deploy and needs the next command, not a
  // diagnosis.
  test('names the migration script and the required order', () => {
    assert.match(HOSTEL_MIGRATION_REQUIRED, /scripts\/migrateHostelsToRooms\.js/);
    assert.match(HOSTEL_MIGRATION_REQUIRED, /stop the backend/i);
    assert.match(HOSTEL_MIGRATION_REQUIRED, /docs\/rollout-hostel-to-room\.md/);
  });
});
