import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';

const express = (await import('express')).default;
const { currentDataRevision, trackDataRevision } = await import('../middleware/dataRevision.js');

/* A throwaway app rather than the real one: the counter's whole contract is
   "which finished responses count as a change", and that is a property of real
   Express responses, not of any route this repo happens to have. */
const app = express();
app.use(trackDataRevision);
app.get('/read', (req, res) => res.json({ ok: true }));
app.post('/write', (req, res) => res.json({ ok: true }));
app.post('/refused', (req, res) => res.status(403).json({ ok: false }));
app.post('/broken', (req, res) => res.status(500).json({ ok: false }));

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

/* The bump rides on the response's 'finish' event, which the server may emit a
   tick after the client has the body. Every assertion below therefore lets the
   socket settle first rather than racing it. */
const call = async (method, path) => {
  await fetch(`${base}${path}`, { method });
  await new Promise((resolve) => setTimeout(resolve, 25));
};

describe('the data revision counter', () => {
  test('a write that succeeded moves it on', async () => {
    const before = currentDataRevision();
    await call('POST', '/write');
    assert.equal(currentDataRevision(), before + 1);
  });

  test('a read leaves it alone', async () => {
    const before = currentDataRevision();
    await call('GET', '/read');
    assert.equal(currentDataRevision(), before);
  });

  test('a refused write leaves it alone', async () => {
    const before = currentDataRevision();
    await call('POST', '/refused');
    assert.equal(currentDataRevision(), before, 'a rejected write invalidated the caches');
  });

  test('a write that blew up leaves it alone', async () => {
    const before = currentDataRevision();
    await call('POST', '/broken');
    assert.equal(currentDataRevision(), before, 'a failed write invalidated the caches');
  });
});
