const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const auth = require('../middleware/authMiddleware');
const role = require('../middleware/roleMiddleware');

// CRUD for students
router.post('/', auth, role(['admin', 'developer']), studentController.createStudent);
router.get('/', auth, role(['admin', 'developer']), studentController.getAllStudents);
router.get('/:id', auth, role(['admin', 'developer', 'parent']), studentController.getStudentById);
router.put('/:id', auth, role(['admin', 'developer']), studentController.updateStudent);
router.delete('/:id', auth, role(['admin', 'developer']), studentController.deleteStudent);

// New route: get linked students for a parent
router.get('/linked/:parentId', auth, role(['parent']), studentController.getLinkedStudentsForParent);

// New route: generate QR code (admin only)
router.post('/generate-qr', auth, role(['admin']), studentController.generateStudentQRCode);

// Bulk generate QR codes (admin only)
router.post('/bulk-generate-qr', auth, role(['admin']), studentController.bulkGenerateStudentQRCodes);

module.exports = router;
