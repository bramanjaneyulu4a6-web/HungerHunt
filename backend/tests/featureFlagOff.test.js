import test, { before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
// The point of this file. Node runs each test file in its own process, so this
// stays off even though the sibling API test turns it on.
process.env.FEATURE_V1_PROCUREMENT = 'false';

const app = (await import('../app.js')).default;

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

describe('FEATURE_V1_PROCUREMENT off', () => {
  test('the versioned routes are not mounted at all', async () => {
    const response = await fetch(`${base}/api/v1/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    const body = await response.json();

    // 404 from the catch-all, not 401/403 from a mounted route's guard.
    assert.equal(response.status, 404);
    assert.match(body.message, /^Route not found: POST \/api\/v1\/purchase-orders/);
  });

  test('legacy routes keep the pre-slice error shape and no request id', async () => {
    // A disallowed origin is the one error the app raises without a database.
    mock.method(console, 'error', () => {});
    const response = await fetch(`${base}/health`, {
      headers: { Origin: 'https://not-an-allowed-origin.example' },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.deepEqual(body, { message: 'Not allowed by CORS' });
    assert.equal(response.headers.get('x-request-id'), null);
    mock.restoreAll();
  });
});
