/* The one way these scripts open a database, so the target is resolved,
   announced and connected identically whichever one you run.
 *
 * Reads .env.production.local here rather than in utils/scriptTarget.js: the
 * decision of *which* uri stays pure and testable, and the file system is
 * touched in exactly one place. */
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { resolveMongoUri, targetBanner } from '../../utils/scriptTarget.js';
import { scriptConnectOptions } from '../../config/mongoPool.js';

const productionEnvPath = new URL('../../.env.production.local', import.meta.url);

export const connectForScript = async () => {
  let productionEnv = null;

  try {
    productionEnv = await readFile(productionEnvPath, 'utf8');
  } catch {
    // Absent is fine unless --prod was asked for, which resolveMongoUri
    // refuses on its own with a message naming the missing file.
  }

  const target = resolveMongoUri({
    argv: process.argv.slice(2),
    env: process.env,
    productionEnv,
  });

  // Printed before connecting, so a run against the wrong database is visible
  // even when the connection is what fails.
  console.log(targetBanner(target));

  /* A small pool on purpose. These scripts — the payments reconcile sweep most
     of all, which runs every fifteen minutes — share one shared-tier cluster
     with the live service. Left at the driver default a background sweep may
     open a hundred connections and spend the cluster's budget on work no
     parent is waiting for. */
  await mongoose.connect(target.uri, scriptConnectOptions());

  return target;
};
