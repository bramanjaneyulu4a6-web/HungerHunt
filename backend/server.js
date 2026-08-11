// Loads .env before any other module is evaluated. Must stay the first import:
// config/firebase.js reads process.env at module scope.
import 'dotenv/config';

import mongoose from 'mongoose';

import app from './app.js';
import { startPushRetrySweep } from './utils/sendNotification.js';

// The app itself is built in app.js and exported without a database connection
// or a listening socket, so the tests can mount it directly. This file is the
// part that only makes sense when actually running the server.

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB Connected Successfully');

    // Retries notifications the moment of sending could not deliver — started
    // here and not in app.js for the same reason the socket is: the tests
    // mount the app, and nothing they mount should tick on its own.
    startPushRetrySweep();
  })
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
