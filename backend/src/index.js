require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Firebase configuration - wrap in try-catch to handle missing env vars
let admin;
try {
  const firebaseConfig = require('./config/firebase');
  admin = firebaseConfig.admin;
  console.log('✅ Firebase module loaded');
} catch (error) {
  console.error('❌ Failed to load Firebase config:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

// Import route modules
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const logRoutes = require('./routes/logRoutes');

const app = express();

// CORS setup: allow frontend URL or fallback to '*'
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['*'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Middleware
app.use(express.json());
// Use morgan only in development, or use 'combined' format in production
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'GuardianEntry API is running 🚀' });
});

// Mount routes with /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/logs', logRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 8000;

async function startServer() {
  try {
    console.log('🔄 Starting server...');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Firebase is already initialized in config/firebase.js
    console.log('✅ Firebase connected');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://0.0.0.0:${PORT}/`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Start server only after DB connections succeed
startServer();
