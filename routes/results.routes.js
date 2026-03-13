// const express = require('express');
// const router = express.Router();
// const resultController = require('../controller/results.controller');
// const { authenticate } = require('../middlewares/auth.middleware');
// const { authorize } = require('../middlewares/role.middelware');

// // ==========================================
// // 🚀 1. أوامر الفحص والتقارير (Scanning APIs)
// // ==========================================

// // بدء الفحص
// router.post('/scan-all', authenticate, resultController.scanAll);

// router.get('/', authenticate, resultController.getAllReports);

// // جلب تاريخ الفحوصات لرابط معين (History)
// router.get('/url/:id/reports', authenticate, resultController.getReportsByUrl);

// // جلب تفاصيل تقرير محدد (Details)
// router.get('/report/:reportId', authenticate, resultController.getReportById);


// // ==========================================
// // 📄 2. تحميل ملف الـ PDF (AI Generation)
// // ==========================================

// // 🔥 اللينك ده هينادي على دالة generateAndDownloadPDF من الكنترولر الموحد
// router.get('/report/:reportId/download', authenticate, resultController.generateAndDownloadPDF);

// module.exports = router;






const express = require('express');
const router = express.Router();
const resultController = require('../controller/results.controller');
const reportController = require('../controller/reports.Controller'); // <-- ضيف السطر ده فوق
const {authenticate} = require('../middlewares/auth.middleware');
const {authorize} = require('../middlewares/role.middelware');

// بدء الفحص
router.post('/scan-all',  authenticate, resultController.scanAll);

router.get('/' ,authenticate, authorize('admin'),resultController.getAllReports);

// جلب تاريخ الفحوصات لرابط معين (History)
router.get('/url/:id/reports',authenticate, resultController.getReportsByUrl);



// في ملف routes/results.routes.js

// ... الأكواد القديمة ...

// جلب بيانات التقرير كـ JSON للداشبورد (الفرونت إند)
// router.get('/report/:scanId/data', authenticate, reports.Controller.getReportData);

// تحميل ملف الـ PDF
router.get('/report/:scanId/download', authenticate, reportController.getReportData);

module.exports = router;