import assert from 'node:assert/strict';
import test from 'node:test';

import { currentDataRevision, dataRevision } from '../middleware/dataRevision.js';

const response = (statusCode = 200) => {
  const headers = {};
  return {
    statusCode,
    headers,
    set(name, value) { headers[name] = value; },
    end(body) { return body; },
  };
};

test('a successful backend write advances the shared data revision', () => {
  const before = currentDataRevision();
  const res = response(201);
  dataRevision({ method: 'POST' }, res, () => {});
  res.end();

  assert.equal(currentDataRevision(), before + 1);
  assert.equal(res.headers['X-Data-Revision'], String(before + 1));
});

test('reads and failed writes do not announce a data change', () => {
  const before = currentDataRevision();
  const read = response(200);
  dataRevision({ method: 'GET' }, read, () => {});
  read.end();

  const failed = response(400);
  dataRevision({ method: 'PATCH' }, failed, () => {});
  failed.end();

  assert.equal(currentDataRevision(), before);
  assert.equal(failed.headers['X-Data-Revision'], undefined);
});
