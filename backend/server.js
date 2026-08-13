// Loads .env before any other module is evaluated. Must stay the first import:
// config/firebase.js reads process.env at module scope.
import 'dotenv/config';

import mongoose from 'mongoose';

import app from './app.js';
import { startPushRetrySweep } from './utils/sendNotification.js';
import { validateRuntimeEnv } from './config/runtimeEnv.js';

// The app itself is built in app.js and exported without a database connection
// or a listening socket, so the tests can mount it directly. This file is the
// part that only makes sense when actually running the server.

const start = async () => {
  const { port } = validateRuntimeEnv();

  // Never accept traffic before the database is usable. Money workflows use
  // MongoDB transactions and cannot safely run in a degraded database state.
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log('MongoDB Connected Successfully');

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
