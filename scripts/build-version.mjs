/* Stamps a build with the commit it came from, written to dist/version.json.
 *
 * Written after an afternoon spent proving a deployment was current by
 * downloading its JavaScript bundle and grepping it for a phrase that only
 * existed in the new code. That works, but it is archaeology: it needs someone
 * who knows which string is new, and it cannot answer the question at all for
 * an app whose change was invisible after tree-shaking.
 *
 * A build that names its own commit answers it in one request, for every app,
 * including the ones whose diff was too small to see. */
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Vercel's variables win where they exist — they describe the commit the CDN
   is actually serving, which is the question being asked. Git is the fallback
   so a local build produces a comparable stamp rather than an empty one.
 *
 * `env` and `now` are parameters rather than globals so this is testable, and
 * the returned object is built field by field rather than spread from the
 * environment: a stamp is a public file, and a spread would eventually carry
 * something that should not be public. */
export const buildVersionPayload = ({ app, env = {}, gitSha = null, now = new Date() }) => {
  const sha = env.VERCEL_GIT_COMMIT_SHA || gitSha;

  return {
    app,
    // Seven characters, because it gets compared by eye against the output of
    // `git rev-parse --short HEAD`.
    commit: sha ? String(sha).slice(0, 7) : 'unknown',
    ref: env.VERCEL_GIT_COMMIT_REF || 'unknown',
    env: env.VERCEL_ENV || 'local',
    builtAt: now.toISOString(),
  };
};

const localGitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // A shallow or absent checkout is not a reason to fail a build; the stamp
    // says "unknown" and the Vercel variables usually cover it anyway.
    return null;
  }
};

// Only when run as a script, so importing it for a test writes nothing.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const appDir = process.cwd();
  const payload = buildVersionPayload({ app: basename(appDir), env: process.env, gitSha: localGitSha() });
  const target = resolve(appDir, 'dist', 'version.json');

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`version.json — ${payload.app} @ ${payload.commit} (${payload.env})`);
}
