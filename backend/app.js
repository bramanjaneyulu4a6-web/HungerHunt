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
import purchaseRoutes from './routes/purchaseRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import stockGroupRoutes from './routes/stockGroupRoutes.js';
import unitRoutes from './routes/unitRoutes.js';
import { authBypassEnabled } from './middleware/devBypass.js';
import { parentSecretIsShared } from './utils/tokens.js';
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

if (authBypassEnabled) {
  console.warn(
    '\n*** AUTH_BYPASS IS ON — every admin and parent route is unauthenticated. ***' +
    '\n*** Local development only. Unset AUTH_BYPASS before deploying. ***\n'
  );
}

if (parentSecretIsShared()) {
  console.warn(
    'PARENT_JWT_SECRET is not set, so parent tokens are signed with JWT_SECRET.' +
    ' The role claim still separates them; setting a second secret makes an' +
    ' admin token unusable on a parent route at the signature instead.'
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

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",

  "https://hunger-hunt-beta.vercel.app",
  "https://hunger-hunt-parent.vercel.app",
  "https://hunger-hunt-kiosk.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests like Postman or server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock-groups', stockGroupRoutes);
app.use('/api/units', unitRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

export default app;
