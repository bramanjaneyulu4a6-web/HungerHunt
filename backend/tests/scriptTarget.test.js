// Which database a script is about to write to, worked out before it connects.
//
// This file exists because of a real incident: a catalogue seed, an archive and
// an image upload were all run against local dev believing they were hitting
// production, and every result read as success — an empty collection reports
// "nothing to do" in exactly the words a finished job does. The grep that was
// supposed to supply the production URI was fragile, and the line naming the
// target was one among many.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { readEnvValue, describeUri, looksLocal, resolveMongoUri } = await import(
  '../utils/scriptTarget.js'
);

describe('readEnvValue', () => {
  test('reads a plain value', () => {
    assert.equal(readEnvValue('MONGO_URI=mongodb://h/db', 'MONGO_URI'), 'mongodb://h/db');
  });

  // The failure the hand-rolled grep had: a quoted value carried its quotes
  // into the connection string.
  for (const [label, line] of [
    ['double quotes', 'MONGO_URI="mongodb://h/db"'],
    ['single quotes', "MONGO_URI='mongodb://h/db'"],
    ['trailing space', 'MONGO_URI=mongodb://h/db   '],
    ['space around the equals', 'MONGO_URI = mongodb://h/db'],
  ]) {
    test(`strips ${label}`, () => {
      assert.equal(readEnvValue(line, 'MONGO_URI'), 'mongodb://h/db');
    });
  }

  // Passwords contain '=' more often than anyone expects, and cutting on the
  // first one is right while cutting on the last is catastrophic.
  test('keeps an equals sign inside the value', () => {
    assert.equal(
      readEnvValue('MONGO_URI=mongodb://u:p=q@h/db', 'MONGO_URI'),
      'mongodb://u:p=q@h/db'
    );
  });

  test('finds the key among other lines', () => {
    const file = '# comment\nPORT=5000\nMONGO_URI=mongodb://h/db\nJWT_SECRET=x\n';
    assert.equal(readEnvValue(file, 'MONGO_URI'), 'mongodb://h/db');
  });

  test('ignores a commented-out key', () => {
    assert.equal(readEnvValue('#MONGO_URI=mongodb://h/db', 'MONGO_URI'), null);
  });

  // MONGO_URI_OLD is not MONGO_URI, and connecting to the wrong one of those
  // is the whole failure this file guards against.
  test('does not match a key that merely starts the same', () => {
    assert.equal(readEnvValue('MONGO_URI_OLD=mongodb://h/old', 'MONGO_URI'), null);
  });

  test('returns null when the key is absent', () => {
    assert.equal(readEnvValue('PORT=5000', 'MONGO_URI'), null);
  });
});

describe('describeUri', () => {
  test('names the host and database of an Atlas URI', () => {
    const d = describeUri('mongodb://u:secret@ac-x.mongodb.net:27017,ac-y.mongodb.net:27017/graarr_ecommerce?ssl=true');
    assert.equal(d.database, 'graarr_ecommerce');
    assert.ok(d.host.includes('mongodb.net'));
  });

  test('names the host and database of a local URI', () => {
    const d = describeUri('mongodb://127.0.0.1:27017/hungerhunt_dev');
    assert.equal(d.database, 'hungerhunt_dev');
    assert.equal(d.host, '127.0.0.1:27017');
  });

  // Printed to a terminal and pasted into chat logs, so it must never carry
  // the password it was parsed from.
  test('never exposes credentials', () => {
    const d = describeUri('mongodb+srv://admin:hunter2@cluster.mongodb.net/shop');
    assert.equal(JSON.stringify(d).includes('hunter2'), false);
    assert.equal(JSON.stringify(d).includes('admin'), false);
  });

  test('refuses something that is not a Mongo URI', () => {
    assert.throws(() => describeUri('not a uri'), /uri/i);
  });
});

describe('looksLocal', () => {
  for (const uri of [
    'mongodb://127.0.0.1:27017/db',
    'mongodb://localhost:27017/db',
    'mongodb://[::1]:27017/db',
  ]) {
    test(`${uri} is local`, () => assert.equal(looksLocal(uri), true));
  }

  test('an Atlas cluster is not local', () => {
    assert.equal(looksLocal('mongodb+srv://u:p@cluster.mongodb.net/db'), false);
  });
});

describe('resolveMongoUri', () => {
  const PROD_FILE = 'MONGO_URI=mongodb+srv://u:p@cluster.mongodb.net/graarr_ecommerce';

  test('without --prod it uses the ambient environment', () => {
    const r = resolveMongoUri({
      argv: [],
      env: { MONGO_URI: 'mongodb://127.0.0.1:27017/hungerhunt_dev' },
      productionEnv: PROD_FILE,
    });
    assert.equal(r.uri, 'mongodb://127.0.0.1:27017/hungerhunt_dev');
    assert.equal(r.viaProdFlag, false);
  });

  test('--prod reads the production file, whatever the environment says', () => {
    const r = resolveMongoUri({
      argv: ['--prod'],
      env: { MONGO_URI: 'mongodb://127.0.0.1:27017/hungerhunt_dev' },
      productionEnv: PROD_FILE,
    });
    assert.ok(r.uri.includes('graarr_ecommerce'));
    assert.equal(r.viaProdFlag, true);
  });

  // Silently falling back to dev is the exact failure this replaces.
  test('--prod with no production file refuses rather than falling back', () => {
    assert.throws(
      () => resolveMongoUri({ argv: ['--prod'], env: { MONGO_URI: 'mongodb://127.0.0.1/db' }, productionEnv: null }),
      /production/i
    );
  });

  test('--prod with a file that has no MONGO_URI refuses', () => {
    assert.throws(
      () => resolveMongoUri({ argv: ['--prod'], env: {}, productionEnv: 'PORT=5000' }),
      /MONGO_URI/
    );
  });

  test('no --prod and no MONGO_URI anywhere refuses', () => {
    assert.throws(() => resolveMongoUri({ argv: [], env: {}, productionEnv: PROD_FILE }), /MONGO_URI/);
  });

  // The reverse mistake: .env itself pointing at production, so a plain run
  // writes to it without anyone asking for that.
  test('flags a non-local target reached without asking for production', () => {
    const r = resolveMongoUri({
      argv: [],
      env: { MONGO_URI: 'mongodb+srv://u:p@cluster.mongodb.net/graarr_ecommerce' },
      productionEnv: PROD_FILE,
    });
    assert.equal(r.unexpectedlyRemote, true);
  });

  test('a local target reached without --prod is not flagged', () => {
    const r = resolveMongoUri({
      argv: [],
      env: { MONGO_URI: 'mongodb://127.0.0.1:27017/hungerhunt_dev' },
      productionEnv: PROD_FILE,
    });
    assert.equal(r.unexpectedlyRemote, false);
  });
});
