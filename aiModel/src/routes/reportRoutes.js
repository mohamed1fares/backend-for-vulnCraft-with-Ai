const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../../../middlewares/auth.middleware');

/* ===============================
   🔐 Validate MongoDB ObjectId
   =============================== */
const validateObjectId = (req, res, next) => {
    const { scanId } = req.params;

    if (!scanId) {
        return res.status(400).json({ message: 'Scan ID is required' });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(scanId)) {
        return res.status(400).json({ message: 'Invalid Scan ID format' });
    }

    next();
};

/* ===============================
   ⚙️ Validate query flags
   =============================== */
const validateQueryFlags = (req, res, next) => {
    const validFlags = ['regenerate', 'reanalyze'];

    for (const flag of validFlags) {
        if (req.query[flag] !== undefined) {
            const value = req.query[flag];
            if (!['true', 'false'].includes(value)) {
                return res.status(400).json({
                    message: `Invalid ${flag} flag. Use true or false.`
                });
            }
            req.query[flag] = value === 'true';
        }
    }

    next();
};

/* ===============================
   🛡️ Safe Controller Wrapper
   =============================== */
const safeAsync = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/* ===============================
   📄 GET Report PDF
   =============================== */
/**
 * GET /api/report/:scanId
 * Optional Query:
 *   ?regenerate=true|false  — Force PDF regeneration from cached AI
 *   ?reanalyze=true|false   — Re-run AI analysis + regenerate PDF
 */
router.get(
    '/:scanId',
    authenticate,
    validateObjectId,
    validateQueryFlags,
    safeAsync(reportController.generateAndDownloadPDF)
);

module.exports = router;
