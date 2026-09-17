// The stamp baked into a bundle and the stamp served beside it at
// /version.json must be the same value, or every open tab would believe a new
// build had been deployed the moment it loaded.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { versionStampPlugin, STAMP_DEFINE_KEY } = await import('../../scripts/versionStampPlugin.mjs');

const AT = new Date('2026-09-17T10:00:00.000Z');
const ENV = { VERCEL_GIT_COMMIT_SHA: 'ff0ca7cabc123', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_ENV: 'production' };

const build = (options) => {
  const plugin = versionStampPlugin(options);
  const config = plugin.config({}, { command: 'build', mode: 'production' });
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  return { plugin, config, emitted };
};

describe('versionStampPlugin', () => {
  test('bakes the same stamp it writes to version.json', () => {
    const { config, emitted } = build({ app: 'frontend-admin', env: ENV, gitSha: null, now: AT });
    const file = emitted.find((f) => f.fileName === 'version.json');
    assert.ok(file, 'version.json is emitted');
    assert.equal(file.type, 'asset');

    const served = JSON.parse(file.source);
    const baked = JSON.parse(config.define[STAMP_DEFINE_KEY]);
    assert.equal(baked, `${served.commit}@${served.builtAt}`);
    assert.equal(baked, 'ff0ca7c@2026-09-17T10:00:00.000Z');
  });

  test('writes the documented fields and nothing else, as the script did', () => {
    const { emitted } = build({ app: 'frontend-admin', env: { ...ENV, SECRET_TOKEN: 'no' }, gitSha: null, now: AT });
    const source = emitted[0].source;
    assert.ok(source.endsWith('}\n'), 'pretty-printed with a trailing newline');
    assert.deepEqual(Object.keys(JSON.parse(source)).sort(), ['app', 'builtAt', 'commit', 'env', 'ref']);
    assert.equal(JSON.parse(source).app, 'frontend-admin');
  });

  test('uses the define key the watcher reads', () => {
    assert.equal(STAMP_DEFINE_KEY, 'import.meta.env.VITE_BUILD_STAMP');
  });

  // The dev server has no version.json to compare against, so the watcher
  // must see no stamp at all and stay inert.
  test('defines nothing and emits nothing when serving', () => {
    const plugin = versionStampPlugin({ app: 'x', env: ENV, gitSha: null, now: AT });
    assert.equal(plugin.config({}, { command: 'serve', mode: 'development' }), undefined);
    const emitted = [];
    plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
    assert.equal(emitted.length, 0);
  });

  test('falls back to the local commit when Vercel says nothing', () => {
    const { config } = build({ app: 'x', env: {}, gitSha: 'abc1234567', now: AT });
    assert.equal(JSON.parse(config.define[STAMP_DEFINE_KEY]), 'abc1234@2026-09-17T10:00:00.000Z');
  });

  test('the watcher reads the emitted file back to the baked stamp', async () => {
    const { stampOf } = await import('../src/utils/deployWatch.js');
    const { config, emitted } = build({ app: 'frontend-admin', env: ENV, gitSha: null, now: AT });
    assert.equal(stampOf(JSON.parse(emitted[0].source)), JSON.parse(config.define[STAMP_DEFINE_KEY]));
  });
});
