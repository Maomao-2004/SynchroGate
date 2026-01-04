const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const auth = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// Schedule management
router.post('/', auth, role(['admin', 'developer']), scheduleController.createSchedule);
router.get('/', auth, role(['admin', 'developer', 'parent', 'student']), scheduleController.getSchedules);
// router.put('/:id', auth, role(['admin', 'developer']), scheduleController.updateSchedule);
// router.delete('/:id', auth, role(['admin', 'developer']), scheduleController.deleteSchedule);

module.exports = router;
