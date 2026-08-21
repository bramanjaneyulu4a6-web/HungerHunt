/* Which database a maintenance script is about to touch, decided and stated
   before it connects.
 *
 * Written after a real incident. A catalogue seed, an archive pass and an image
 * upload were all run believing they targeted production; all three hit local
 * dev, and every result read as success — an empty collection reports "nothing
 * to do" in the same words a finished job does. Three things had to line up:
 * the production URI was supplied by a hand-rolled `grep | cut` that could
 * return the wrong thing, `.env` supplied a perfectly valid fallback, and the
 * line naming the target was one among many.
 *
 * So: asking for production is a flag rather than a shell incantation, the
 * parsing is tested rather than improvised, and the target is announced in a
 * block that cannot be mistaken for progress output. */

const QUOTED = /^(['"])(.*)\1$/s;

/* A .env parser narrow enough to be correct. Only what these files hold: one
   KEY=VALUE per line, optionally quoted, possibly commented.
 *
 * Split on the FIRST equals, never the last — passwords contain '=' more often
 * than anyone expects, and cutting at the wrong one yields a URI that is
 * plausible and wrong. */
export const readEnvValue = (contents, key) => {
  for (const line of String(contents ?? '').split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const equals = trimmed.indexOf('=');

    if (equals === -1) continue;

    // Compared whole, so MONGO_URI_OLD is not mistaken for MONGO_URI — which
    // is the same class of mistake this file exists to prevent.
    if (trimmed.slice(0, equals).trim() !== key) continue;

    const raw = trimmed.slice(equals + 1).trim();
    const quoted = raw.match(QUOTED);

    return quoted ? quoted[2] : raw;
  }

  return null;
};

/* Host and database only. This gets printed to a terminal and pasted into
   chat logs and tickets, so it must never carry the password it was parsed
   from — which is why it returns a shape rather than the URI itself. */
export const describeUri = (uri) => {
  const match = String(uri ?? '').match(/^mongodb(\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/([^?]*)/i);

  if (!match) {
    throw new Error('Not a MongoDB connection uri.');
  }

  return { host: match[2], database: match[3] || '(none)' };
};

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i;

export const looksLocal = (uri) => {
  const { host } = describeUri(uri);
  return host.split(',').every((part) => LOCAL_HOST.test(part.trim()));
};

/* Where this run should point, and whether anyone asked for that.
 *
 * `productionEnv` is the contents of .env.production.local, passed in rather
 * than read here so the decision stays testable and the file is read once by
 * the caller that knows where it lives. */
export const resolveMongoUri = ({ argv = [], env = {}, productionEnv = null } = {}) => {
  const viaProdFlag = argv.includes('--prod');

  if (viaProdFlag) {
    // Refuses rather than falling back. A silent fallback to dev is the exact
    // failure this replaces: the run succeeds, against the wrong database.
    if (productionEnv === null || productionEnv === undefined) {
      throw new Error(
        '--prod needs backend/.env.production.local, which is not there. Nothing was run.'
      );
    }

    const uri = readEnvValue(productionEnv, 'MONGO_URI');

    if (!uri) {
      throw new Error('No MONGO_URI in .env.production.local. Nothing was run.');
    }

    return { uri, viaProdFlag: true, unexpectedlyRemote: false };
  }

  const uri = env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is required. Set it in backend/.env, or pass --prod.');
  }

  // The reverse mistake, and the reason this is a field rather than a throw:
  // `.env` itself pointing somewhere remote means an ordinary-looking run
  // writes to it without anyone having asked. Worth saying loudly; not worth
  // refusing, because a staging database is a legitimate thing to point at.
  return { uri, viaProdFlag: false, unexpectedlyRemote: !looksLocal(uri) };
};

/* The announcement. A block rather than a line, because the last time this
   mattered the target was printed and read straight past. */
export const targetBanner = ({ uri, viaProdFlag, unexpectedlyRemote }) => {
  const { host, database } = describeUri(uri);
  const rule = '─'.repeat(66);
  const label = viaProdFlag ? 'PRODUCTION (--prod)' : looksLocal(uri) ? 'local' : 'REMOTE';

  const lines = [
    rule,
    `  target     ${label}`,
    `  database   ${database}`,
    `  host       ${host}`,
  ];

  if (unexpectedlyRemote) {
    lines.push(
      '',
      '  This is not a local database and --prod was not passed, so it was',
      '  reached through backend/.env. Check that is what you meant.'
    );
  }

  lines.push(rule, '');

  return lines.join('\n');
};
