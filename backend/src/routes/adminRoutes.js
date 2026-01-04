// src/routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const logController = require('../controllers/logController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

// Routes accessible by both Admin and Developer roles
router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'developer']));

// Admin & Developer shared routes
router.get('/users', adminController.getUsers);
router.post('/generate-qr', adminController.generateQRForUser);
// router.get('/reports', adminController.getReports); // Method doesn't exist yet

// Developer-only routes - using logController methods
router.get('/system-logs', logController.getLogs);
router.get('/arduino-events', logController.getArduinoEvents);

module.exports = router;
