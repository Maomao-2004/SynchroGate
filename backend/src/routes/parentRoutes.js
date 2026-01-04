// src/routes/parentRoutes.js
const express = require('express');
const parentController = require('../controllers/parentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['parent']));

// GET /api/parent/linked-students
router.get('/linked-students', parentController.getLinkedStudents);

module.exports = router;
