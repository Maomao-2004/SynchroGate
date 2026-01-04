// src/routes/notificationRoutes.js
const express = require('express');
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

// Admin & Developer can send push notification
router.post(
  '/push',
  authMiddleware,
  roleMiddleware(['admin', 'developer']),
  notificationController.sendPushNotification
);

// Admin & Developer can send SMS notification
router.post(
  '/sms',
  authMiddleware,
  roleMiddleware(['admin', 'developer']),
  notificationController.sendSMSNotification
);

// Admin, Developer, Parent can get notifications history by userId
router.get(
  '/history/:userId',
  authMiddleware,
  roleMiddleware(['admin', 'developer', 'parent']),
  notificationController.getNotificationHistory
);

// Parent-specific route to get their notifications (frontend calls /notifications/parent)
router.get(
  '/parent',
  authMiddleware,
  roleMiddleware(['parent']),
  notificationController.getParentNotifications
);

// Optional: Log notification event internally
router.post(
  '/log',
  authMiddleware,
  roleMiddleware(['admin', 'developer']),
  notificationController.logNotificationEvent
);

// Alert push notification endpoint (used by frontend for real-time alerts)
// This endpoint doesn't require auth middleware because it's called internally
// from the frontend when alerts are created/updated
router.post(
  '/alert-push',
  notificationController.sendAlertPushNotification
);

module.exports = router;
