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

const app = express();

if (authBypassEnabled) {
  console.warn(
    '\n*** AUTH_BYPASS IS ON — every admin and parent route is unauthenticated. ***' +
    '\n*** Local development only. Unset AUTH_BYPASS before deploying. ***\n'
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

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
