import test from 'node:test';
import assert from 'node:assert/strict';

import { skipAuthLimitsInDevelopment } from '../middleware/rateLimit.js';

test('authentication limits are skipped only in development', () => {
  const saved = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = 'development';
    assert.equal(skipAuthLimitsInDevelopment(), true);

    for (const environment of ['production', 'test', 'staging', 'Development', '']) {
      process.env.NODE_ENV = environment;
      assert.equal(
        skipAuthLimitsInDevelopment(),
        false,
        `NODE_ENV=${environment} disabled authentication throttling`
      );
    }

    delete process.env.NODE_ENV;
    assert.equal(skipAuthLimitsInDevelopment(), false);
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
});
