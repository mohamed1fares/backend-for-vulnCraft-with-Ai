# 🚀 AI Model & Reporting System Setup Guide

هذا الدليل مصمم لمساعدة أي مطور (Developer) على أخذ مجلد `aiModel` وربطه بأي نظام Backend بسهولة تامة. المجلد يعمل كوحدة مستقلة (Standalone Module) تأخذ مخرجات الفحص الخام (Raw Scan Data) وتحولها إلى تقرير احترافي (PDF) باستخدام الذكاء الاصطناعي مع قياس دقيق للمخاطر.

---

## 📦 1. المتطلبات الأساسية (Prerequisites)

قبل البدء، تأكد من أن مشروع الـ Backend الخاص بك يحتوي على الحزم التالية في `package.json`:

```bash
npm install axios dotenv puppeteer fs-extra moment
```

> **ملاحظة:** المجلد يستخدم `puppeteer` للتحويل الدقيق من HTML إلى PDF، و `axios` للاتصال بـ API الذكاء الاصطناعي.

---

## ⚙️ 2. المتغيرات البيئية (Environment Variables)

أضف المتغيرات التالية في ملف `.env` الخاص بالباك إند:

```env
# مفتاح الـ API الخاص بـ OpenRouter أو Groq
GROQ_API_KEY=your_api_key_here

# رابط الـ API (استخدم OpenRouter كمثال)
GROQ_API_URL=https://api.groq.com/openai/v1/chat/completions
GROQ_API_KEY=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
GROQ_MODEL=llama-3.1-8b-instant

---

## 🧩 3. كيفية الربط مع نظامك (Integration Steps)

لنفترض أن لديك Controller يقوم بعمل فحص (Scan) لموقع معين وحصلت على نتائج الفحص في مصفوفة (Array). هكذا تقوم بتمريرها للـ `aiModel`:

### الخطوة الأولى: استدعاء ملفات الـ AI Module

في الـ Controller الخاص بك، قم باستدعاء الدوال التالية:

```javascript
const { prepareDataForAI } = require("./aiModel/src/utils/ai-cleaner.utils");
const { generateReportContent } = require("./aiModel/src/utils/groq.service");
const { enrichFindings, generateReportMetadata } = require("./aiModel/src/utils/risk-scoring.utils");
const { buildFullReportHTML } = require("./aiModel/src/services/report-builder.service");
const { generateAndSavePDF } = require("./aiModel/src/services/pdf.service");
```

### الخطوة الثانية: شكل البيانات المطلوبة (Expected Input Data)

يجب أن تكون نتائج الفحص الخام (scanDetails) الخاصة بك مصفوفة بهذا الشكل التقريبي:

```javascript
const scanDetails = [
  {
    vulnerabilityName: "SQL Injection",
    isDetected: true,
    severity: "High", // Low, Medium, High, Critical
    technicalDetail: {
      url: "http://example.com/login",
      details: [
        {
          method: "POST",
          param: "username",
          payload: "admin' OR 1=1--",
          response: "Database syntax error..."
        }
      ]
    }
  }
];

const targetUrl = "http://example.com";
```

### الخطوة الثالثة: تشغيل دورة حياة التقرير (Execution)

قم بنسخ هذا الكود داخل الـ Controller الخاص بك لتوليد التقرير:

```javascript
async function generateFinalReport(scanDetails, targetUrl, scanId) {
    try {
        // 1. تنظيف البيانات وتجهيزها (حساب مبدئي للأولويات وللـ Risk Score)
        const cleanedData = prepareDataForAI(scanDetails, targetUrl);

        // 2. إرسال البيانات للذكاء الاصطناعي لكتابة التقرير
        const aiJsonContent = await generateReportContent(targetUrl, cleanedData);

        // 3. إثراء البيانات النهائية وإضافة حسابات الخطورة الدقيقة
        const enrichedFindings = enrichFindings(cleanedData.findings || []);

        // 4. توليد الميتا داتا الخاصة بالتقرير (إحصائيات، Score، الخ)
        const metadata = generateReportMetadata(enrichedFindings, targetUrl);

        // 5. بناء كود الـ HTML الاحترافي
        const fullHtml = buildFullReportHTML(aiJsonContent, metadata, enrichedFindings);

        // 6. تحويل الـ HTML إلى PDF وحفظه
        // scanId هو اختياري، يمكن استخدامه لتسمية الملف برقم الفحص
        const pdfResult = await generateAndSavePDF(fullHtml, targetUrl, metadata, scanId);

        console.log("✅ PDF Generated Successfully:", pdfResult.reportPath);
        return pdfResult;

    } catch (error) {
        console.error("❌ Error generating AI report:", error);
        throw error;
    }
}
```

---

## 🚀 4. الراوتر المرفق للتحميل المباشر (Download Route)

مجلد `aiModel` يأتي جاهزاً براوتر للتحميل `reportRoutes.js`.
يمكنك ربطه مباشرة في `app.js` أو `server.js` كالتالي:

```javascript
const reportRoutes = require('./aiModel/src/routes/reportRoutes');

// سيتم تحميل التقرير عبر الرابط: GET /api/report/:scanId
app.use('/api/report', reportRoutes);
```

> **تنبيه:** ستحتاج إلى تعديل `reportController.js` المرفق في الـ Module ليتناسب مع اسم Model قاعدة البيانات الخاص بك (مثلاً `ScanResult`) لجلب اسم ملف الـ PDF المحفوظ.

---

## 🎯 ملخص ما يفعله الموديل بالنيابة عنك:
1. **فلترة الأخطاء:** يتجاهل ثغرات الشبكة الوهمية (Timeouts/Request Errors).
2. **حساب رياضي حقيقي:** لا يترك الذكاء الاصطناعي يخمن الخطورة؛ بل يعتمد على `risk-scoring.utils.js` (Deterministic Logic).
3. **منع الهلوسة (Anti-hallucination):** الموديل يقوم بعمل Cross-Validation ويمسح أي ثغرة يؤلفها الذكاء الاصطناعي ولم تكن موجودة في البيانات الأصلية.
4. **شكل احترافي:** توليد PDF بتصميم الشركات (Corporate Grade) يشمل الجداول الدائرية والـ Heatmaps ورسوم البيانية.

---

## 💻 5. أمثلة حية للكود من الباك إند الفعلي (Real-World Examples)

إليك أمثلة حقيقية مأخوذة من الكود الذي يعمل حالياً للتوضيح المباشر:

### 📄 مثال 1: توليد التقرير والـ PDF (مأخوذ من `reportController.js`)
هذا هو الكود الفعلي الذي يستدعى عند الدخول لرابط الـ PDF لتوليده أو جلبه:

```javascript
const path = require("path");
// استدعاء مكاتب الذكاء الاصطناعي
const { prepareDataForAI } = require("../utils/ai-cleaner.utils");
const { generateReportContent } = require("../utils/groq.service");
const { generateAndSavePDF } = require("../services/pdf.service");
const { enrichFindings, generateReportMetadata } = require("../utils/risk-scoring.utils");
const { buildFullReportHTML } = require("../services/report-builder.service");

exports.generateAndDownloadPDF = async (req, res) => {
  const { scanId } = req.params;

  try {
    // 1. جلب بيانات الفحص من قاعدة البيانات الخاصة بك
    const scan = await ScanResult.findById(scanId).populate("url");
    if (!scan) return res.status(404).json({ message: "Scan not found" });

    const targetUrl = scan.url ? scan.url.originalUrl : "Target Website";
    const scanDetails = scan.details ? scan.details : [];

    // 2. تنظيف البيانات وحساب الخطورة
    const cleanedData = prepareDataForAI(scanDetails, targetUrl);
    const enrichedFindings = enrichFindings(cleanedData.findings || []);
    const metadata = generateReportMetadata(enrichedFindings, targetUrl);

    // 3. استدعاء الذكاء الاصطناعي لكتابة المحتوى
    const aiJsonContent = await generateReportContent(targetUrl, cleanedData);

    // 4. بناء الـ HTML بعد التحقق من هلوسات الـ AI
    const fullHtml = buildFullReportHTML(aiJsonContent, metadata, enrichedFindings);

    // 5. تحويل الـ HTML إلى ملف PDF وحفظه
    const result = await generateAndSavePDF(fullHtml, targetUrl, metadata);

    // 6. تحميل (Download) الملف للعميل
    res.download(result.reportPath);

  } catch (error) {
    console.error(`💥 Report Generation Failed: ${error.message}`);
    res.status(500).json({ message: "Report Generation Failed", error: error.message });
  }
};
```

### 📄 مثال 2: الاتصال بالذكاء الاصطناعي أثناء الفحص (مأخوذ من `results.controller.js`)

إذا كنت تريد استباق توليد تقرير الـ AI أثناء إنهاء سكريبتات الـ Python للفحص، لحفظه في قاعدة البيانات:

```javascript
// ... بعد انتهاء جميع وحصولك على resultsArray (مصفوفة نتيجة الفحص) ...
const { prepareDataForAI } = require("../aiModel/src/utils/ai-cleaner.utils");
const { generateReportContent } = require("../aiModel/src/utils/groq.service");

try {
  // 1. تنظيف الداتا
  const cleanedData = prepareDataForAI(resultsArray, targetUrlString);
  
  // 2. التوليد عبر Groq / OpenRouter API
  const aiReportContent = await generateReportContent(targetUrlString, cleanedData);

  // 3. حفظ بيانات التقرير كنص JSON في الـ DB
  const newReport = new Report({
      url: urlId,
      details: resultsArray,
      aiReportContent: JSON.stringify(aiReportContent),
  });
  await newReport.save();
  
  console.log("✅ AI Report generated and saved to database.");

} catch (aiError) {
  console.error("❌ AI Generation failed:", aiError);
}
```
