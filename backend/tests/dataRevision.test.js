import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

const express = (await import('express')).default;
const { currentDataRevision, dataRevision } = await import('../middleware/dataRevision.js');

/* A throwaway app rather than the real one: the counter's whole contract is
   "which finished responses count as a change", and that is a property of real
   Express responses, not of any route this repo happens to have. */
const app = express();
app.use(dataRevision);
app.get('/read', (req, res) => res.json({ ok: true }));
app.post('/write', (req, res) => res.json({ ok: true }));
app.post('/refused', (req, res) => res.status(403).json({ ok: false }));
app.post('/broken', (req, res) => res.status(500).json({ ok: false }));
/* Real paths, because the exemption is decided by path: these succeed and
   write, but what they write is nobody else's read model. */
app.post('/api/parent/login', (req, res) => res.json({ ok: true }));
app.post('/api/parent/save-fcm-token', (req, res) => res.json({ ok: true }));
app.post('/api/students/kiosk-session', (req, res) => res.json({ ok: true }));
app.post('/api/admin/reset-password/abc123', (req, res) => res.json({ ok: true }));
app.post('/api/parent/packages/p1/simulate-warehouse', (req, res) => res.json({ ok: true }));

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

/* The bump rides on the response being ended, which the server may complete a
   tick after the client has the body. Every assertion below therefore lets the
   socket settle first rather than racing it. */
const call = async (method, path) => {
  const response = await fetch(`${base}${path}`, { method });
  await response.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 25));
  return response;
};

describe('the data revision counter', () => {
  test('a write that succeeded moves it on, and says so in the header', async () => {
    const before = currentDataRevision();
    const response = await call('POST', '/write');

    assert.equal(currentDataRevision(), before + 1);
    assert.equal(response.headers.get('x-data-revision'), String(before + 1));
  });

  test('a read leaves it alone', async () => {
    const before = currentDataRevision();
    const response = await call('GET', '/read');

    assert.equal(currentDataRevision(), before);
    assert.equal(response.headers.get('x-data-revision'), null);
  });

  test('a refused write leaves it alone', async () => {
    const before = currentDataRevision();
    const response = await call('POST', '/refused');

    assert.equal(currentDataRevision(), before, 'a rejected write invalidated the caches');
    assert.equal(response.headers.get('x-data-revision'), null);
  });

  /* Signing in, opening the kiosk, or a phone re-sending its push token are
     writes to the requester's own session or device, not to anything another
     screen shows. Counting them reloaded every open tab in the fleet on each
     one, and the token re-send reloaded parent devices in a loop. */
  for (const path of [
    '/api/parent/login',
    '/api/parent/save-fcm-token',
    '/api/students/kiosk-session',
    '/api/admin/reset-password/abc123',
  ]) {
    test(`${path} leaves it alone`, async () => {
      const before = currentDataRevision();
      const response = await call('POST', path);

      assert.equal(response.status, 200);
      assert.equal(currentDataRevision(), before, 'a session write reloaded the fleet');
      assert.equal(response.headers.get('x-data-revision'), null);
    });
  }

  test('a write under the same router that changes shared data still counts', async () => {
    const before = currentDataRevision();
    const response = await call('POST', '/api/parent/packages/p1/simulate-warehouse');

    assert.equal(currentDataRevision(), before + 1);
    assert.equal(response.headers.get('x-data-revision'), String(before + 1));
  });

  test('a write that blew up leaves it alone', async () => {
    const before = currentDataRevision();
    const response = await call('POST', '/broken');

    assert.equal(currentDataRevision(), before, 'a failed write invalidated the caches');
    assert.equal(response.headers.get('x-data-revision'), null);
  });
});
