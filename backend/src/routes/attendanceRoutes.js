const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// Student check-in (student only)
router.post('/check-in', auth, role(['student']), attendanceController.checkIn);

// Student check-out (student only)
router.post('/check-out', auth, role(['student']), attendanceController.checkOut);

// Get attendance logs for a student (admin, developer, parent)
router.get('/logs/:studentId', auth, role(['admin', 'developer', 'parent']), attendanceController.getLogs);

// Bulk upload logs for offline sync (admin or developer can do this)
// router.post('/sync', auth, role(['admin', 'developer']), attendanceController.syncOfflineLogs);

module.exports = router;
