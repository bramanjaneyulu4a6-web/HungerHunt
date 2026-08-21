// The stamp each app serves at /version.json, so "is what I just pushed
// actually live?" is one curl rather than downloading a bundle and grepping it
// for a string you hope only exists in the new build.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { buildVersionPayload } = await import('../../scripts/build-version.mjs');

const AT = new Date('2026-08-21T12:00:00.000Z');

describe('buildVersionPayload', () => {
  test('prefers the commit Vercel reports', () => {
    const p = buildVersionPayload({
      app: 'frontend-admin',
      env: { VERCEL_GIT_COMMIT_SHA: 'ff0ca7cabc123', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_ENV: 'production' },
      gitSha: 'localsha0000',
      now: AT,
    });
    assert.equal(p.commit, 'ff0ca7c');
    assert.equal(p.ref, 'main');
    assert.equal(p.env, 'production');
  });

  // Building locally has no Vercel variables, and a stamp that only worked on
  // Vercel could not be compared against the repo in front of you.
  test('falls back to the local git commit', () => {
    const p = buildVersionPayload({ app: 'frontend-admin', env: {}, gitSha: 'abc1234567', now: AT });
    assert.equal(p.commit, 'abc1234');
    assert.equal(p.ref, 'unknown');
    assert.equal(p.env, 'local');
  });

  // Short, because it is compared by eye against `git rev-parse --short HEAD`.
  test('shortens the commit to seven characters', () => {
    const p = buildVersionPayload({ app: 'x', env: {}, gitSha: '0123456789abcdef', now: AT });
    assert.equal(p.commit, '0123456');
  });

  test('records the app it was built for and when', () => {
    const p = buildVersionPayload({ app: 'hungerhunt-kiosk', env: {}, gitSha: 'abc1234', now: AT });
    assert.equal(p.app, 'hungerhunt-kiosk');
    assert.equal(p.builtAt, '2026-08-21T12:00:00.000Z');
  });

  // A stamp claiming a commit it does not have is worse than no stamp: it
  // would be believed.
  test('says unknown rather than inventing a commit', () => {
    const p = buildVersionPayload({ app: 'x', env: {}, gitSha: null, now: AT });
    assert.equal(p.commit, 'unknown');
  });

  test('never carries anything but the fields it documents', () => {
    const p = buildVersionPayload({
      app: 'x',
      env: { VERCEL_GIT_COMMIT_SHA: 'abc1234', SECRET_TOKEN: 'do-not-leak' },
      gitSha: null,
      now: AT,
    });
    assert.deepEqual(Object.keys(p).sort(), ['app', 'builtAt', 'commit', 'env', 'ref']);
  });
});
