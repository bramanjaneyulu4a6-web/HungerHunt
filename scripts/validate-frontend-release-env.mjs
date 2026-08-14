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
console.log(`Release API target validated: ${apiUrl.origin}/api`);
