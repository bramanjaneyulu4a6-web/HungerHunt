// Loads .env before any other module is evaluated. Must stay the first import:
// config/firebase.js reads process.env at module scope.
import 'dotenv/config';

import mongoose from 'mongoose';

import app from './app.js';
import FulfillmentOrder, { WEEKLY_ORDER_INDEX } from './models/FulfillmentOrder.js';
import { startPushRetrySweep } from './utils/sendNotification.js';
import { validateRuntimeEnv } from './config/runtimeEnv.js';

// The app itself is built in app.js and exported without a database connection
// or a listening socket, so the tests can mount it directly. This file is the
// part that only makes sense when actually running the server.

/* The database half of the disabled weekly-order rule.
 *
 * The schema stops declaring the unique index, but a database that already
 * carries it goes on enforcing it — the application would stop asking and
 * students would go on being refused. So it is dropped here, once, where the
 * connection is known good and autoIndex has nothing left to rebuild from.
 *
 * Already gone is the normal state of every boot after the first. Anything
 * else is fatal on purpose: a server that came up believing the rule was
 * lifted while the database still holds it would refuse students with a
 * duplicate-key error nobody is expecting.
 */
const releaseWeeklyOrderIndex = async () => {
  try {
    await FulfillmentOrder.collection.dropIndex(WEEKLY_ORDER_INDEX);
    console.warn(
      `Weekly order limit disabled — dropped ${WEEKLY_ORDER_INDEX}.` +
        ' Students may now place more than one package order per business week.'
    );
  } catch (error) {
    // IndexNotFound / NamespaceNotFound: nothing to drop, which is the goal.
    if (error?.codeName === 'IndexNotFound' || error?.code === 27 || error?.code === 26) return;
    throw error;
  }
};

const start = async () => {
  const { port } = validateRuntimeEnv();

  // Never accept traffic before the database is usable. Money workflows use
  // MongoDB transactions and cannot safely run in a degraded database state.
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log('MongoDB Connected Successfully');

  await releaseWeeklyOrderIndex();

  startPushRetrySweep();
  const server = app.listen(port, () => console.log(`Server running on port ${port}`));

  const shutdown = (signal) => {
    console.log(`${signal} received; draining HTTP connections.`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
