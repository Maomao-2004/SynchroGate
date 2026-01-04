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

// Import alert push service (auto-sends push notifications when alerts change)
const alertPushService = require('./services/alertPushService');

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

// Health check endpoints (Railway checks these)
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'GuardianEntry API is running 🚀',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Additional health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    service: 'GuardianEntry API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'GuardianEntry API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      notifications: '/api/notifications',
      students: '/api/students',
      attendance: '/api/attendance',
      admin: '/api/admin',
      schedules: '/api/schedules',
      logs: '/api/logs'
    },
    timestamp: new Date().toISOString()
  });
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

// Add process error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit - let Railway handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let Railway handle it
});

// Handle SIGTERM gracefully (Railway sends this when stopping)
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  alertPushService.cleanupAlertListeners();
  process.exit(0);
});

// Handle SIGINT gracefully
process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');
  alertPushService.cleanupAlertListeners();
  process.exit(0);
});

async function startServer() {
  try {
    console.log('🔄 Starting server...');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Firebase is already initialized in config/firebase.js
    console.log('✅ Firebase connected');
    
    // Initialize alert push listeners (auto-send push notifications when alerts change)
    // This works even when the app is closed because the backend is always running
    await alertPushService.initializeAllAlertListeners();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://0.0.0.0:${PORT}/`);
      console.log(`✅ Server is ready to accept connections`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }
      console.error('❌ Server error:', error);
    });

    // Keep the process alive
    setInterval(() => {
      // Periodic heartbeat to ensure process stays alive
      if (server.listening) {
        console.log('💓 Server heartbeat - still running');
      }
    }, 30000); // Every 30 seconds

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Start server only after DB connections succeed
startServer();
