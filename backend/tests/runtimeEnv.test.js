import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRuntimeEnv } from '../config/runtimeEnv.js';

const original = { ...process.env };

const productionEnv = () => ({
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb://database.example/hungerhunt',
  JWT_SECRET: 'a'.repeat(32),
  PARENT_JWT_SECRET: 'b'.repeat(32),
  STUDENT_JWT_SECRET: 'c'.repeat(32),
  BUSINESS_TIME_ZONE: 'Asia/Kolkata',
  EMAIL_USER: 'mail@example.com',
  EMAIL_PASS: 'mail-secret',
  CLOUDINARY_CLOUD_NAME: 'cloud',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  FIREBASE_PROJECT_ID: 'project',
  FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
  FIREBASE_PRIVATE_KEY: 'private-key',
  PARENT_CLIENT_URL: 'https://parent.example.com',
  ADMIN_CLIENT_URL: 'https://admin.example.com',
  WAREHOUSE_CLIENT_URL: 'https://warehouse.example.com',
  KIOSK_CLIENT_URL: 'https://kiosk.example.com',
  TRUST_PROXY: '1',
  CORS_ORIGINS: '',
});

const withEnv = (values, run) => {
  process.env = { ...original, ...values };
  try {
    return run();
  } finally {
    process.env = { ...original };
  }
};

test('accepts a complete production runtime environment', () => {
  withEnv(productionEnv(), () => assert.deepEqual(validateRuntimeEnv(), { port: 5001 }));
});

test('production client URLs must be deployable HTTPS origins', () => {
  withEnv(
    { ...productionEnv(), PARENT_CLIENT_URL: 'http://localhost:5173' },
    () => assert.throws(() => validateRuntimeEnv(), /PARENT_CLIENT_URL must use HTTPS/)
  );
  withEnv(
    { ...productionEnv(), ADMIN_CLIENT_URL: 'https://example.com/admin' },
    () => assert.throws(() => validateRuntimeEnv(), /origin with no path/)
  );
  withEnv(
    { ...productionEnv(), KIOSK_CLIENT_URL: 'https://device.local' },
    () => assert.throws(() => validateRuntimeEnv(), /must not point to a local development host/)
  );
});

test('production refuses unsafe or ambiguous proxy trust settings', () => {
  for (const value of ['true', 'all', '0', '11']) {
    withEnv(
      { ...productionEnv(), TRUST_PROXY: value },
      () => assert.throws(() => validateRuntimeEnv(), /TRUST_PROXY must be an integer/)
    );
  }
});

test('development keeps integrations and deployed origins optional', () => {
  withEnv(
    { NODE_ENV: 'development', MONGO_URI: 'mongodb://localhost/test', JWT_SECRET: 'dev' },
    () => assert.deepEqual(validateRuntimeEnv(), { port: 5001 })
  );
});
