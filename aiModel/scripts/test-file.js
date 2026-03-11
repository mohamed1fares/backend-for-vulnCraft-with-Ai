const fs = require('fs-extra');
const path = require('path');
const markdownpdf = require('markdown-pdf');

// استدعاء الأدوات
const { prepareDataForAI } = require('../src/utils/ai-cleaner.utils');
const { generateReportContent } = require('../src/utils/ollama.service');

const runTest = async () => {
    try {
        console.log("🚀 Starting CSS Style Test...");

        // 1. قراءة ملف الداتا
        const inputPath = path.join(__dirname, 'input.json');
        const rawData = fs.readFileSync(inputPath, 'utf8');
        const jsonData = JSON.parse(rawData); 
        const scanDetails = jsonData.details ? jsonData.details : jsonData;

        // 2. تنظيف الداتا
        console.log("🧹 Cleaning Data...");
        const cleanedData = prepareDataForAI(scanDetails);

        // 3. الذكاء الاصطناعي
        console.log("🤖 AI is writing the report...");
        const markdownContent = await generateReportContent("CSS-Test-Target.com", cleanedData);
        console.log("✅ AI Response Received!");

        // 4. إعدادات الـ CSS والـ PDF
        // المسار: بنطلع من scripts ونخش reports
        const cssPath = path.join(__dirname, '../reports/report.css');
        console.log(`🎨 Looking for CSS at: ${cssPath}`);

        // نتأكد إن الملف موجود
        if (fs.existsSync(cssPath)) {
            console.log("✅ CSS File FOUND! Applying styles...");
        } else {
            console.warn("⚠️ CSS File NOT FOUND! PDF will be plain.");
        }

        const options = {
            cssPath: fs.existsSync(cssPath) ? cssPath : null, // هنا السر كله
            paperFormat: 'A4',
        };

        // اسم الملف اللي هيطلع
        const outputPath = path.join(__dirname, 'TEST_CSS_STYLE.pdf');

        console.log("📄 Generating PDF...");

        markdownpdf(options)
            .from.string(markdownContent)
            .to(outputPath, function () {
                console.log("\n=======================================");
                console.log("🎉 PDF GENERATED WITH STYLE!");
                console.log(`📍 File Location: ${outputPath}`);
                console.log("=======================================\n");
            });

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
};

runTest();