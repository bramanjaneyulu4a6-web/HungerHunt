// Loads .env before any other module is evaluated. Must stay the first import:
// config/firebase.js reads process.env at module scope.
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import mongoose from 'mongoose';

import adminRoutes from './routes/adminRoutes.js';
import adminUserRoutes from './routes/adminUserRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import productRoutes from './routes/productRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import pendingOrderRoutes from './routes/pendingOrderRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import stockGroupRoutes from './routes/stockGroupRoutes.js';
import hostelRoutes from './routes/hostelRoutes.js';
import unitRoutes from './routes/unitRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';
import purchaseOrderRoutes from './src/interfaces/http/routes/purchaseOrderRoutes.js';
import analyticsRoutes from './src/interfaces/http/routes/analyticsRoutes.js';
import fulfillmentOrderRoutes from './src/interfaces/http/routes/fulfillmentOrderRoutes.js';
import caretakerFulfillmentOrderRoutes from './src/interfaces/http/routes/caretakerFulfillmentOrderRoutes.js';
import caretakerReportRoutes from './src/interfaces/http/routes/caretakerReportRoutes.js';
import staffReportRoutes from './src/interfaces/http/routes/staffReportRoutes.js';
import accountingExportRoutes from './src/interfaces/http/routes/accountingExportRoutes.js';
import replenishmentDraftRoutes from './src/interfaces/http/routes/replenishmentDraftRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { requestContext } from './src/interfaces/http/middleware/requestContext.js';
import { trackDataRevision } from './middleware/dataRevision.js';
import { logger } from './src/shared/observability/logger.js';
import { v1ProcurementEnabled } from './config/features.js';
import { parentSecretIsShared, studentSecretIsShared } from './utils/tokens.js';
import { graceUntil, unverifiedBillsAccepted } from './utils/purchaseAuthorization.js';

const app = express();

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

if (parentSecretIsShared()) {
  console.warn(
    'PARENT_JWT_SECRET is not set, so parent tokens are signed with JWT_SECRET.' +
    ' The role claim still separates them; setting a second secret makes an' +
    ' admin token unusable on a parent route at the signature instead.'
  );
  console.warn(
    'Set PARENT_JWT_SECRET before issuing production accounts. Adding it later' +
    ' invalidates parent sessions signed with the shared key, for up to seven days.'
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

/* UPI payment env that fails quietly, not loudly, when it is missing. Unset
   client credentials at least fail every payment create with an error a
   parent sees; the two below never announce themselves at all, so they get
   the same treatment as the JWT secrets above: say it at boot. PHONEPE_ENV
   and PHONEPE_CLIENT_VERSION are omitted on purpose — both have safe
   defaults (sandbox, "1"). The full set is listed in .env.example. */
const missingPaymentEnv = [
  'PHONEPE_CLIENT_ID',
  'PHONEPE_CLIENT_SECRET',
  'PHONEPE_WEBHOOK_USERNAME',
  'PHONEPE_WEBHOOK_PASSWORD',
  'PHONEPE_REDIRECT_BASE_URL',
].filter((name) => !process.env[name]?.trim());

if (missingPaymentEnv.length) {
  console.warn(
    `PhonePe payment env is incomplete (${missingPaymentEnv.join(', ')} unset), and the failures` +
    ' are quiet ones: missing webhook credentials 401 every PhonePe webhook so money only lands' +
    ' via the app\'s poll and the reconcile sweep, and a missing PHONEPE_REDIRECT_BASE_URL' +
    ' registers the literal string "undefined/payment-return?..." with PhonePe as the return URL.' +
    ' The full PHONEPE_* set is documented in .env.example.'
  );
}

app.use(helmet());

// Gzip every compressible response above the default 1KB threshold. The
// catalogue and order lists are the payloads that matter; tiny health checks
// stay uncompressed on purpose.
app.use(compression());

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* A dev-server origin arriving through configuration rather than the list below.
 *
 * These four variables also drive things like password-reset links, so in a
 * local checkout they legitimately hold http://localhost values — and until this
 * filter existed they were merged into the allowlist unconditionally, which
 * quietly re-enabled in production exactly what the list below switches off. One
 * stale variable on the deployed service was enough to do it, with nothing
 * anywhere to say so.
 *
 * Only plaintext loopback is dropped. https://localhost is left alone: it is not
 * a dev server, it is what the Android builds send.
 */
const isPlaintextLoopback = (origin) =>
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);

const configuredOrigins = [
  process.env.ADMIN_CLIENT_URL,
  process.env.PARENT_CLIENT_URL,
  process.env.WAREHOUSE_CLIENT_URL,
  process.env.KIOSK_CLIENT_URL,
  ...(process.env.CORS_ORIGINS || '').split(','),
]
  .map((origin) => origin?.trim().replace(/\/$/, ''))
  .filter(Boolean)
  .filter(
    (origin) => process.env.NODE_ENV !== 'production' || !isPlaintextLoopback(origin)
  );

/* The Vite dev servers, and only them.
 *
 * These are the origins the four apps are served from while someone is working
 * on them. Nothing else ever sends one, so a production deployment has no
 * reason to accept them — and every origin on the list is a standing invitation
 * for a browser somewhere to make credentialed calls on a signed-in user's
 * behalf. In production this list is empty.
 *
 * Local development is unaffected: a backend started without NODE_ENV=production
 * still accepts them, so a local frontend against a local API works exactly as
 * before. What stops working is a *dev server pointed at the live API* — that is
 * the thing being switched off, and it is deliberate.
 */
const devServerOrigins =
  process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:5173", // frontend-parent
        "http://localhost:5174", // frontend-admin
        "http://localhost:5175", // hungerhunt-kiosk
        "http://localhost:5176", // hungerhunt-warehouse (port pinned in its vite.config)
        "http://localhost:3000",
      ];

const allowedOrigins = new Set([
  ...devServerOrigins,

  /* Not dev servers. These two are the *native* apps.
   *
   * Capacitor hosts the bundle inside the WebView rather than serving it from a
   * web origin, and stamps one of these on every request it makes (iOS keeps the
   * capacitor: scheme, Android serves over https). They are fixed by the platform
   * and identical on every device, so they are not deployment configuration and
   * they must survive into production — the parent app, the kiosk APK and the
   * warehouse APK all depend on them. Delete them while tidying away "localhost"
   * and every installed phone build 403s on its first call, looking broken with
   * nothing in the logs to explain why.
   */
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

/* Above every route, including the /api/v1 surface mounted through v1() below,
   because the read caches downstream are only safe while nothing can write
   without being counted. A route added later inherits this by existing. */
app.use(trackDataRevision);

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
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/pending-orders', pendingOrderRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock-groups', stockGroupRoutes);
app.use('/api/hostels', hostelRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/payments', paymentRoutes);

// Request ids and the structured error envelope belong to the versioned HTTP
// contract, not to procurement. Keeping the middleware scoped here means a
// procurement kill switch cannot silently change unrelated legacy responses.
const v1 = (path, routes) => app.use(path, requestContext, routes);

// Procurement-specific routes may be withdrawn together. Orders already in
// PENDING_REVIEW remain stored and become reachable when the flag returns.
if (v1ProcurementEnabled) {
  v1('/api/v1/purchase-orders', purchaseOrderRoutes);
  v1('/api/v1/analytics', analyticsRoutes);
  v1('/api/v1/replenishment-drafts', replenishmentDraftRoutes);
}

// These are independent operational contracts. They remain available if the
// school pauses procurement review, which is the central promise of the flag.
v1('/api/v1/fulfillment-orders', fulfillmentOrderRoutes);
v1('/api/v1/caretaker/fulfillment-orders', caretakerFulfillmentOrderRoutes);
v1('/api/v1/caretaker/reports', caretakerReportRoutes);
v1('/api/v1/reports', staffReportRoutes);
v1('/api/v1/accounting-exports', accountingExportRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// The pre-slice handler, kept whole rather than reconstructed from the new one:
// it echoes the real message at every status and prints the raw stack.
const legacyErrorHandler = (err, req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
};

const v1ErrorHandler = (err, req, res, _next) => {
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

app.use((err, req, res, next) => (
  req.originalUrl.startsWith('/api/v1/')
    ? v1ErrorHandler(err, req, res, next)
    : legacyErrorHandler(err, req, res, next)
));

export default app;
