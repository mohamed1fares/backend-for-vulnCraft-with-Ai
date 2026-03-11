const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/:scanId', reportController.generateAndDownloadPDF);

module.exports = router;