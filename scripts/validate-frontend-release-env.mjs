import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const parseEnvFile = (path) => {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || match[1].startsWith('#')) return [];

        let value = match[2];
        if (
          value.length >= 2 &&
          ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'")))
        ) {
          value = value.slice(1, -1);
        }
        return [[match[1], value]];
      })
  );
};

const fileEnv = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
].reduce((values, name) => ({ ...values, ...parseEnvFile(resolve(name)) }), {});

const env = { ...fileEnv, ...process.env };
const rawApiUrl = env.VITE_API_BASE_URL?.trim();

if (!rawApiUrl) {
  throw new Error('VITE_API_BASE_URL is required for a release build.');
}

let apiUrl;
try {
  apiUrl = new URL(rawApiUrl);
} catch {
  throw new Error('VITE_API_BASE_URL must be a valid absolute URL.');
}

const host = apiUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

if (apiUrl.protocol !== 'https:') {
  throw new Error('VITE_API_BASE_URL must use HTTPS for a release build.');
}
if (
  ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host) ||
  host.endsWith('.localhost') ||
  host.endsWith('.local')
) {
  throw new Error('VITE_API_BASE_URL must not point to a local development host.');
}
if (apiUrl.username || apiUrl.password) {
  throw new Error('VITE_API_BASE_URL must not contain credentials.');
}
if (apiUrl.search || apiUrl.hash) {
  throw new Error('VITE_API_BASE_URL must not contain a query string or fragment.');
}
if (apiUrl.pathname.replace(/\/$/, '') !== '/api') {
  throw new Error('VITE_API_BASE_URL must end with /api.');
}
/* The payment flags are asked of the app that actually has a checkout, and only
   of it. `--payments` is passed by frontend-parent's build:release; the admin,
   warehouse and kiosk bundles read neither variable, and demanding them there
   meant three Vercel projects carrying two values that mean nothing to them —
   which is how a deploy came to fail on a flag about a feature the app does not
   have. An app that ships a checkout declares it, rather than every app paying
   for one app's rule.

   The two flags decide whether a store build ships a working checkout
   or a labelled demo, and both default the wrong way round for a release.
   `frontend-parent/src/services/payments.js` turns payments on only when
   VITE_PAYMENTS_ENABLED is exactly 'true' (line 34), and leaves the demo
   checkout ON unless VITE_DEMO_UPI_ENABLED is exactly 'false' (line 40, which
   tests `!== 'false'`); `PendingApprovalCard.jsx:394` runs the demo when
   either of those holds. So a build that merely forgets them shows parents a
   UPI screen labelled as a preview that never moves any money — which Apple
   rejects under guideline 2.2 and Play under its fully-functional
   requirement, at the end of an upload rather than the start.

   Neither value is trimmed here on purpose: Vite bakes these strings in as
   they are, so a check that trimmed would pass a value the app then reads as
   something else.

   Note the asymmetry. Submitting with payments switched off is a legitimate
   decision — the listing copy just has to match it — so this does not demand
   'true'. What it refuses is shipping on a default nobody chose. The demo
   checkout is not a decision at all: it must never leave the building. */
const shipsPayments = process.argv.includes('--payments');
const demoUpi = env.VITE_DEMO_UPI_ENABLED;
const paymentsEnabled = env.VITE_PAYMENTS_ENABLED;

if (shipsPayments && demoUpi !== 'false') {
  throw new Error(
    'VITE_DEMO_UPI_ENABLED must be exactly false for a release build. Anything else, ' +
      'including leaving it unset, ships the demo UPI checkout to parents. ' +
      'Set VITE_DEMO_UPI_ENABLED=false.',
  );
}

if (shipsPayments && paymentsEnabled !== 'true' && paymentsEnabled !== 'false') {
  throw new Error(
    'VITE_PAYMENTS_ENABLED must be set to exactly true or false for a release build. ' +
      'Shipping without payments is a legitimate choice; shipping on an unset default is ' +
      'not one anybody made. Set VITE_PAYMENTS_ENABLED=true to ship the live gateway — the ' +
      "backend's PHONEPE_* credentials have to be in place for that — or =false to ship " +
      'without it, and cut the payments copy from the store listing to match.',
  );
}

console.log(`Release API target validated: ${apiUrl.origin}/api`);
if (shipsPayments) {
  console.log(
    `Release payment flags validated: demo checkout off, live payments ` +
      `${paymentsEnabled === 'true' ? 'on' : 'off'}.`,
  );
}
