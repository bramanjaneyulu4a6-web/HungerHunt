#!/usr/bin/env node
/* Verifies the files that are deliberately duplicated across the three
   frontends are still identical.
 *
 * The apps are separate Vite builds deployed independently, with no shared
 * package, so a handful of files exist as copies. That is workable only while
 * something notices when they diverge — KioskBilling.jsx had already drifted
 * into two versions, one of which reached for `item.productId._id` without a
 * guard and used blocking alert() calls the other had replaced.
 *
 * That file is no longer listed. The kiosk redesign gave the till a look of its
 * own, built on hungerhunt-kiosk/src/kiosk.css, which the admin console does not
 * load — so the two copies could not be reconciled. The admin console's /kiosk
 * route was retired instead: it duplicated /billing, which does the same job in
 * the console's own styling. The till now has one owner, which is a better
 * answer than a check asserting two copies match.
 *
 * Anything still on the list below is genuinely meant to be byte-identical.
 * Before adding a file, ask whether it should have one owner instead.
 *
 * Run: node scripts/check-shared-files.mjs
 * Exits non-zero on drift, so it can gate a commit or CI step.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SHARED = [
  {
    file: 'src/theme.css',
    apps: ['frontend-parent', 'frontend-admin', 'hungerhunt-kiosk', 'hungerhunt-warehouse'],
  },
  {
    file: 'src/ui.css',
    apps: ['frontend-parent', 'frontend-admin', 'hungerhunt-kiosk', 'hungerhunt-warehouse'],
  },
  {
    file: 'src/components/ui/index.jsx',
    apps: ['frontend-parent', 'frontend-admin', 'hungerhunt-kiosk', 'hungerhunt-warehouse'],
  },
  {
    file: 'src/utils/format.js',
    apps: ['frontend-parent', 'frontend-admin', 'hungerhunt-kiosk', 'hungerhunt-warehouse'],
  },
  {
    file: 'src/components/RefreshButton.jsx',
    apps: ['frontend-admin', 'hungerhunt-kiosk', 'hungerhunt-warehouse'],
  },
];

const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);

let drifted = 0;

for (const { file, apps } of SHARED) {
  const seen = apps
    .map((app) => ({ app, path: join(root, app, file) }))
    .filter(({ path }) => existsSync(path))
    .map((entry) => ({ ...entry, hash: digest(entry.path) }));

  if (seen.length < apps.length) {
    const missing = apps.filter((a) => !seen.some((s) => s.app === a));
    console.error(`✗ ${file} — missing from ${missing.join(', ')}`);
    drifted++;
    continue;
  }

  const hashes = new Set(seen.map((s) => s.hash));

  if (hashes.size === 1) {
    console.log(`✓ ${file} — identical across ${seen.length} apps`);
  } else {
    console.error(`✗ ${file} — copies have diverged:`);
    for (const { app, hash } of seen) console.error(`    ${hash}  ${app}`);
    drifted++;
  }
}

if (drifted) {
  console.error(
    `\n${drifted} shared file(s) out of sync. Reconcile them, or move the file ` +
      `into a shared package if the copies genuinely need to differ.`
  );
  process.exit(1);
}

console.log('\nAll shared files are in sync.');
