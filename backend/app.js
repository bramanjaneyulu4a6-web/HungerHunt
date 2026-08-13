// Loads .env before any other module is evaluated. Must stay the first import:
// config/firebase.js reads process.env at module scope.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';

import adminRoutes from './routes/adminRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import productRoutes from './routes/productRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import pendingOrderRoutes from './routes/pendingOrderRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import stockGroupRoutes from './routes/stockGroupRoutes.js';
import unitRoutes from './routes/unitRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';
import purchaseOrderRoutes from './src/interfaces/http/routes/purchaseOrderRoutes.js';
import analyticsRoutes from './src/interfaces/http/routes/analyticsRoutes.js';
import fulfillmentOrderRoutes from './src/interfaces/http/routes/fulfillmentOrderRoutes.js';
import accountingExportRoutes from './src/interfaces/http/routes/accountingExportRoutes.js';
import replenishmentDraftRoutes from './src/interfaces/http/routes/replenishmentDraftRoutes.js';
import { requestContext } from './src/interfaces/http/middleware/requestContext.js';
import { logger } from './src/shared/observability/logger.js';
import { v1ProcurementEnabled } from './config/features.js';
import { authBypassEnabled } from './middleware/devBypass.js';
import { parentSecretChangeover, studentSecretIsShared } from './utils/tokens.js';
import { graceUntil, unverifiedBillsAccepted } from './utils/purchaseAuthorization.js';

const app = express();

// Request ids and the structured error envelope travel with the v1 slice: they
// change what *every* route logs and returns, so leaving them on with the flag
// off would mean "deactivated" still differed from the behaviour before it.
if (v1ProcurementEnabled) app.use(requestContext);

// Behind a hosting proxy, req.ip is the proxy's own address unless Express is
// told how many hops to trust — which would put every client in a single
// rate-limit bucket, so ten failed logins from anyone would lock out everyone.
// TRUST_PROXY is the number of proxies in front of this server (most managed
// hosts: 1). Leave it unset when the app is reached directly.
const trustProxy = process.env.TRUST_PROXY?.trim();

if (trustProxy === 'true') {
  // Trusting every hop lets a client set X-Forwarded-For themselves and skip
  // the limiter entirely, so this one value is refused rather than honoured.
  console.warn(
    'TRUST_PROXY=true is unsafe — any client could then spoof its IP and bypass rate limiting.' +
    ' Set it to the number of proxies in front of this server instead. Ignoring it for now.'
  );
} else if (trustProxy) {
  const hops = Number(trustProxy);
  app.set('trust proxy', Number.isInteger(hops) ? hops : trustProxy);
}

if (authBypassEnabled) {
  console.warn(
    '\n*** AUTH_BYPASS IS ON — every admin and parent route is unauthenticated. ***' +
    '\n*** Local development only. Unset AUTH_BYPASS before deploying. ***\n'
  );
}

const parentSecret = parentSecretChangeover();

if (parentSecret.pending) {
  console.warn(
    'PARENT_JWT_SECRET is not set, so parent tokens are signed with JWT_SECRET.' +
    ' The role claim still separates them; setting a second secret makes an' +
    ' admin token unusable on a parent route at the signature instead.'
  );

  // Which of these two it is decides whether setting the key is free or costs
  // every parent their session. See parentSecretChangeover in utils/tokens.js.
  console.warn(
    parentSecret.free
      ? `Set it before ${parentSecret.deadline.toISOString()}. Until then parent tokens` +
        ' signed with the old key are still accepted, so the changeover signs nobody' +
        ' out. After that date it invalidates every parent token in circulation.'
      : `The window that would have carried that changeover closed on` +
        ` ${parentSecret.deadline.toISOString()}, so setting it now signs out every` +
        ' parent holding a live token — up to seven days of them. Still worth doing;' +
        ' pick a quiet hour rather than a lunch service.'
  );
}

/* The same warning for the third key, and deliberately without the parent
   one's arithmetic. A student session lasts 450 seconds, so there is no window
   to be inside or outside of: setting this costs at most seven and a half
   minutes of kiosk sessions, at any hour, on any day. Nothing is ever gained
   by putting it off, which is worth saying plainly — a warning that offers no
   reason to act today is a warning people learn to scroll past. */
if (studentSecretIsShared()) {
  console.warn(
    'STUDENT_JWT_SECRET is not set, so kiosk sessions are signed with JWT_SECRET.' +
    ' The role claim still separates them, but /students/kiosk-session is open —' +
    ' anyone who can reach it mints a token signed with the key that also signs' +
    ' staff, and only that claim stands between the two.'
  );

  console.warn(
    'Setting it is free and always will be: a student session lasts 450 seconds,' +
    ' so the worst it costs is a few kiosk logins. There is no deadline to beat' +
    ' and no quiet hour to wait for.'
  );
}

if (unverifiedBillsAccepted()) {
  console.warn(
    `Bills carrying no purchase authorization are still accepted until ${graceUntil().toISOString()},` +
    ' so tills running a build from before verify-payment issued one keep working.' +
    ' Each such bill is logged; once none appear, close the window early with' +
    ' PURCHASE_AUTH_GRACE_UNTIL.'
  );
}

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const configuredOrigins = [
  process.env.ADMIN_CLIENT_URL,
  process.env.PARENT_CLIENT_URL,
  process.env.WAREHOUSE_CLIENT_URL,
  process.env.KIOSK_CLIENT_URL,
  ...(process.env.CORS_ORIGINS || '').split(','),
]
  .map((origin) => origin?.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176", // hungerhunt-warehouse (port pinned in its vite.config)
  "http://localhost:3000",

  // The native parent apps are not served from a web origin at all: Capacitor
  // hosts the bundle inside the WebView and stamps these two on every request
  // it makes (iOS keeps the capacitor: scheme, Android serves over https). They
  // are fixed by the platform and identical for every device, so they are not
  // deployment configuration — without them the phone builds get a 403 on the
  // first call and the app looks broken with nothing in the logs to say why.
  "capacitor://localhost",
  "https://localhost",

  "https://hunger-hunt-beta.vercel.app",
  "https://hunger-hunt-parent.vercel.app",
  "https://hunger-hunt-kiosk.vercel.app",
  ...configuredOrigins,
]);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests like Postman or server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }

      const err = new Error("Not allowed by CORS");
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health/live', (req, res) => res.json({ status: 'ok' }));

const readiness = (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    db: ready ? 'connected' : 'disconnected',
  });
};

app.get('/health', readiness);
app.get('/health/ready', readiness);

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/pending-orders', pendingOrderRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock-groups', stockGroupRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/receipts', receiptRoutes);

// Versioned enterprise contracts. The routes above remain compatibility
// adapters until all existing clients have migrated.
//
// This is the only door into backend/src, and creating an order is the only way
// one enters the PENDING_REVIEW workflow — so not mounting these leaves the
// whole slice unreachable rather than half-live.
if (v1ProcurementEnabled) {
  app.use('/api/v1/purchase-orders', purchaseOrderRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/fulfillment-orders', fulfillmentOrderRoutes);
  app.use('/api/v1/accounting-exports', accountingExportRoutes);
  app.use('/api/v1/replenishment-drafts', replenishmentDraftRoutes);
}

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// The pre-slice handler, kept whole rather than reconstructed from the new one:
// it echoes the real message at every status and prints the raw stack.
const legacyErrorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
};

const v1ErrorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal Server Error' : err.message;
  const logFailure = status >= 500 ? logger.error : logger.warn;
  logFailure('http.request.failed', {
    requestId: req.context?.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    errorCode: err.code || 'INTERNAL_ERROR',
    error: err.message,
    ...(process.env.NODE_ENV === 'production' ? {} : { stack: err.stack }),
  });
  res.status(status).json({
    // Kept at the top level for existing clients; new clients consume error.
    message,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      ...(err.details ? { details: err.details } : {}),
    },
    meta: { requestId: req.context?.requestId },
  });
};

app.use(v1ProcurementEnabled ? v1ErrorHandler : legacyErrorHandler);

export default app;
