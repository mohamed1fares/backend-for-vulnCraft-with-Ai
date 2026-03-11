const fs = require('fs-extra');
const path = require('path');
const markdownpdf = require('markdown-pdf');

// استدعاء الموديلات والأدوات
const ScanResult = require('../../../model/results.model'); 
const logger = require('../../../utils/logger.utils');
const { prepareDataForAI } = require('../utils/ai-cleaner.utils');
const { generateReportContent } = require('../utils/ollama.service');

exports.generateAndDownloadPDF = async (req, res) => {
    const { scanId } = req.params;

    try {
        if(logger) logger.info(`📄 Requesting PDF for Scan ID: ${scanId}`);

        // 1. جلب الداتا من الداتابيز
        const scan = await ScanResult.findById(scanId).populate('url');
        
        if (!scan) {
            return res.status(404).json({ message: "Scan not found" });
        }

        const targetUrl = scan.url ? scan.url.originalUrl : "Target Website";

        // 2. تنظيف وتجهيز الداتا
        // الحركة دي عشان لو الداتا جاية Object مش Array (زي ما حصل في الاختبار)
        const scanDetails = scan.details ? scan.details : scan;
        const cleanedData = prepareDataForAI(scanDetails);

        // 3. التوليد بالذكاء الاصطناعي
        console.log("🤖 AI is writing the report...");
        const markdownContent = await generateReportContent(targetUrl, cleanedData);

        // 4. تحويل لـ PDF
        // تحديد مسار حفظ الملف في فولدر reports الرئيسي
        const reportsDir = path.join(__dirname, '../../../reports');
        await fs.ensureDir(reportsDir);

        const reportPath = path.join(reportsDir, `Scan_Report_${scanId}.pdf`);
        
        // 🔥 تصحيح مسار الـ CSS 🔥
        const cssPath = path.join(__dirname, '../../reports/report.css');
        
        // إعدادات الـ PDF (لو ملف الـ CSS موجود استخدمه، لو لأ مش مهم)
        const options = {
            cssPath: fs.existsSync(cssPath) ? cssPath : null,
            paperFormat: 'A4',
        };

        // التحويل والتحميل
        markdownpdf(options)
            .from.string(markdownContent)
            .to(reportPath, function () {
                if(logger) logger.info("✅ PDF Generated Successfully!");
                
                // تحميل الملف لليوزر
                res.download(reportPath, (err) => {
                    if (err) console.error("Download Error:", err);
                });
            });

    } catch (error) {
        console.error("💥 Report Generation Failed:", error);
        res.status(500).json({ message: "Report Generation Failed", error: error.message });
    }
};