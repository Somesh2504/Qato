require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const restaurantRoutes = require('./routes/restaurant');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const analyticsRoutes = require('./routes/analytics');
const superadminRoutes = require('./routes/superadmin');
const modificationRoutes = require('./routes/modifications');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Required for rate limiting behind reverse proxies like Render
app.use(helmet());

const allowedOrigins = [
  'https://qravee.me',
  'https://www.qravee.me',
  'https://qato-1.onrender.com/',
  'http://localhost:5173',
  'http://localhost:3000',
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Log only errors using morgan
app.use(morgan('dev', { skip: (req, res) => res.statusCode < 400 }));

// ── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150, // 150 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Strict limit: 20 payment/order attempts per minute per IP to block spam/bots
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment/order attempts, please wait.' }
});

// Apply generic limiter to all API routes
app.use('/api', apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/menu', menuRoutes);
// Apply strict limiter on endpoints that cost DB rows or external API bandwidth
app.use('/api/orders', paymentLimiter, orderRoutes);
app.use('/api/payments', paymentLimiter, paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/modifications', modificationRoutes);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ServeQ backend running' });
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 ServeQ backend running on http://localhost:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/api/health`);
});
