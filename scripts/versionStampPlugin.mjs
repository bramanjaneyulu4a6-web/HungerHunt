/* Stamps a build once, and hands the same stamp to both places that need it.
 *
 * An open tab decides whether it is out of date by comparing the stamp baked
 * into its own bundle with the one the CDN serves at /version.json. Those two
 * must come from one object: build-version.mjs used to run after `vite build`
 * with its own clock, so its builtAt could never match anything the bundle
 * had been given, and every tab would have reloaded the moment it opened.
 *
 * So the stamp is taken when the build starts, given to the bundle as
 * import.meta.env.VITE_BUILD_STAMP, and written out as version.json at the end
 * of the same build. The dev server gets neither: with no stamp the watcher
 * does nothing, which is right for a page Vite is already hot-reloading. */
import { basename, resolve } from 'node:path';
import { buildVersionPayload, localGitSha } from './build-version.mjs';

export const STAMP_DEFINE_KEY = 'import.meta.env.VITE_BUILD_STAMP';

export const versionStampPlugin = ({
  app,
  env = process.env,
  gitSha,
  now,
} = {}) => {
  let payload = null;

  return {
    name: 'hungerhunt-version-stamp',

    config(config, { command }) {
      if (command !== 'build') return undefined;
      payload = buildVersionPayload({
        app: app ?? basename(resolve(config.root ?? process.cwd())),
        env,
        gitSha: gitSha === undefined ? localGitSha() : gitSha,
        now: now ?? new Date(),
      });
      return {
        define: {
          [STAMP_DEFINE_KEY]: JSON.stringify(`${payload.commit}@${payload.builtAt}`),
        },
      };
    },

    generateBundle() {
      if (!payload) return;
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(payload, null, 2)}\n`,
      });
      console.log(`version.json — ${payload.app} @ ${payload.commit} (${payload.env})`);
    },
  };
};
