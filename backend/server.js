// import express from 'express';
// import cors from 'cors';
// import dotenv from 'dotenv';
// import mongoose from 'mongoose';

// import adminRoutes from './routes/adminRoutes.js';
// import parentRoutes from './routes/parentRoutes.js';
// import studentRoutes from './routes/studentRoutes.js';
// import productRoutes from './routes/productRoutes.js';
// import transactionRoutes from './routes/transactionRoutes.js';
// import purchaseRoutes from "./routes/purchaseRoutes.js";
// import inventoryRoutes from "./routes/inventoryRoutes.js";

// // import authRoutes from './routes/authRoutes.js';

// dotenv.config();
// const app = express();

// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Database Connection
// mongoose.connect(process.env.MONGO_URI)
//   .then(() => console.log('MongoDB Connected Successfully'))
//   .catch(err => console.error('MongoDB Connection Error:', err));

// // API Routes
// app.use('/api/admin', adminRoutes);
// app.use('/api/parent', parentRoutes);
// app.use('/api/students', studentRoutes);
// app.use('/api/products', productRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use("/api/purchases", purchaseRoutes);
// app.use("/api/inventory", inventoryRoutes);
// // app.use('/api/auth', authRoutes);
// // Global Error Handler
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).json({ message: err.message || 'Internal Server Error' });
// });

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));




// 19-06-2026




import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import adminRoutes from './routes/adminRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import productRoutes from './routes/productRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import purchaseRoutes from "./routes/purchaseRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import stockGroupRoutes from "./routes/stockGroupRoutes.js";
import unitRoutes from "./routes/unitRoutes.js";




dotenv.config();
const app = express();

// Middleware
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
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

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/products', productRoutes);

// import stockGroupRoutes from "./routes/stockGroupRoutes.js";
// import unitRoutes from "./routes/unitRoutes.js";
app.use('/api/transactions', transactionRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/stock-groups", stockGroupRoutes);
app.use("/api/units", unitRoutes);




app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));