// const mongoose = require("mongoose");
// const path = require("path");
// const fs = require("fs");
// const { spawn, execSync } = require("child_process");
// const logger = require('../utils/logger.utils'); // تأكد من وجوده أو احذفه لو مش عندك
// const sendEmail = require('../utils/email.utils'); 

// // استدعاء الموديلات
// const Url = require("../model/url.model");
// const Report = require("../model/results.model"); 
// const Vulnerability = require("../model/vulnerability.model");

// // --- 1. إعداد المسارات ---
// const SCRIPTS_DIR = path.join(__dirname, "../vulnerabilityFiles");
// const OUTPUT_DIR = path.join(__dirname, "../scan_results");
// const TEMP_DIR = path.join(__dirname, "../temp_payloads");

// // إنشاء المجلدات لو مش موجودة
// if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
// if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// // --- ترتيب خطورة الثغرات ---
// const SEVERITY_RANK = {
//   'safe': 0,
//   'Low': 1, 'low': 1,
//   'Medium': 2,
//   'High': 3,
//   'Critical': 4
// };

// // --- 2. دوال المساعدة (Helpers) ---

// let cachedPythonCommand = null;

// function getPythonCommand() {
//     // لو عرفنا الأمر قبل كده، نرجعه علطول ومندورش تاني
//     if (cachedPythonCommand) return cachedPythonCommand;

//     const commandsToCheck = ['python3', 'python', 'py']; 
//     for (const cmd of commandsToCheck) {
//         try {
//             execSync(`${cmd} --version`, { stdio: 'ignore' });
//             cachedPythonCommand = cmd; // احفظ النتيجة
//             return cmd; 
//         } catch (error) { continue; }
//     }
//     // Fallback
//     cachedPythonCommand = process.platform === "win32" ? "py" : "python3";
//     return cachedPythonCommand;
// }

// function createTempPayload(targetUrl, vulnId) {
//   const filename = `payload_${vulnId}_${Date.now()}.json`;
//   const filePath = path.join(TEMP_DIR, filename);
//   const taskData = {
//     task_id: `scan-${vulnId}`,
//     target: { url: targetUrl },
//     base_url: targetUrl,
//     options: { non_destructive: true },
//   };
//   fs.writeFileSync(filePath, JSON.stringify(taskData, null, 2));
//   return filePath;
// }

// function runScriptWorker(scriptFullPath, payloadPath, pythonCmd) {
//   return new Promise((resolve) => {
//     if (!fs.existsSync(scriptFullPath)) {
//       return resolve({ error: "Script file missing", vulnerable: false });
//     }

//     const cmd = pythonCmd || "python"; 
//     const python = spawn(cmd, [
//       "-u", scriptFullPath, "--payload", payloadPath, "--outdir", OUTPUT_DIR
//     ]);

//     const TIMEOUT_MS = 7 * 60 * 1000; 

// const timeout = setTimeout(() => {
//     python.kill(); // اقتل العملية
//     console.error(`[Timeout] Script took too long: ${scriptFullPath}`);
//     resolve({ error: "Scan timeout exceeded", vulnerable: false });
// }, TIMEOUT_MS);

//     let outputData = "";
    
//     python.stdout.on("data", (data) => { outputData += data.toString(); });
//     python.stderr.on("data", (err) => console.error(`[Py Log]: ${err}`)); 

//     python.on("error", (err) => {
//        console.error(`[Spawn Error]: ${err.message}`);
//        resolve({ error: "Spawn failed", vulnerable: false });
//     });

//     python.on("close", (code) => {
//       clearTimeout(timeout);
//       try { fs.unlinkSync(payloadPath); } catch (e) {} 
//       try {
//         const firstBrace = outputData.indexOf("{");
//         const lastBrace = outputData.lastIndexOf("}");
//         if (firstBrace !== -1 && lastBrace !== -1) {
//             const jsonStr = outputData.substring(firstBrace, lastBrace + 1);
//             resolve(JSON.parse(jsonStr));
//         } else {
//             resolve({ error: "No JSON output", vulnerable: false });
//         }
//       } catch (e) {
//         resolve({ error: "JSON Parse Error", vulnerable: false });
//       }
//     });
//   });
// }

// // --- 3. دالة الفحص الرئيسية (scanAll) ---
// exports.scanAll = async (req, res) => {
//   try {
//     const { urlId } = req.body; 

//     if (!urlId) {
//         return res.status(400).json({ message: "URL ID is required" });
//     }

//     // 🔥🔥 التعديل هنا: إضافة .populate('user') 🔥🔥
//     let urlDoc = await Url.findById(urlId).populate('user');

//     if (!urlDoc) {
//       return res.status(404).json({ message: "URL document not found." });
//     }

//     const targetUrlString = urlDoc.originalUrl;
//

//     // تحديث الحالة
//     urlDoc.status = 'Scanning';
//     urlDoc.numberOfvuln = 0;
//     urlDoc.severity = 'safe';
//     await urlDoc.save();

//     const vulnerabilities = await Vulnerability.find({ isActive: true });
//     if (vulnerabilities.length === 0) {
//       urlDoc.status = 'Finished';
//       await urlDoc.save();
//       return res.status(404).json({ message: "No active vulnerabilities found." });
//     }

//     const pythonCommand = getPythonCommand();
//     // console.log(`🚀 Starting Scan using [${pythonCommand}] for: ${targetUrlString} (ID: ${urlId})`);

//     // تشغيل الفحص
//     const scanPromises = vulnerabilities.map(async (vuln) => {
//       let scriptFileName = vuln.scriptFile ? vuln.scriptFile : vuln.name.trim() + ".py";
//       scriptFileName = path.basename(scriptFileName);
      
//       const scriptFullPath = path.join(SCRIPTS_DIR, scriptFileName);
//       const payloadPath = createTempPayload(targetUrlString, vuln._id);

//       const scriptResult = await runScriptWorker(scriptFullPath, payloadPath, pythonCommand);

//       let isDetected = false;
//       if (scriptResult && !scriptResult.error) {
//         if (scriptResult.summary && scriptResult.summary.findings_count > 0) isDetected = true;
//         else if (scriptResult.vulnerable === true) isDetected = true;
//         else if (Array.isArray(scriptResult.findings) && scriptResult.findings.length > 0) isDetected = true;
//       }

//       // console.log(`Checking ${vuln.name}: ${isDetected ? "DETECTED 🔴" : "Safe 🟢"}`);

//       return {
//         vulnerabilityId: vuln._id,
//         vulnerabilityName: vuln.name,
//         severity: vuln.severity,
//         isDetected: isDetected,
//         technicalDetail: scriptResult 
//       };
//     });

//     const resultsArray = await Promise.all(scanPromises);

//     // الحسابات النهائية
//     let detectedCount = 0;
//     let maxSeverityRank = 0;
//     let finalSeverity = 'safe';

//     resultsArray.forEach(item => {
//       if (item.isDetected) {
//         detectedCount++;
//         const currentRank = SEVERITY_RANK[item.severity] || 0;
//         if (currentRank > maxSeverityRank) {
//           maxSeverityRank = currentRank;
//           finalSeverity = item.severity === 'Low' ? 'low' : item.severity;
//         }
//       }
//     });

//     // حفظ التقرير
//     const newReport = new Report({
//         url: urlDoc._id,
//         summary: {
//             totalVulnerabilities: detectedCount,
//             highestSeverity: finalSeverity
//         },
//         details: resultsArray
//     });

//     await newReport.save();

//     // تحديث الرابط
//     urlDoc.status = 'Finished';
//     urlDoc.numberOfvuln = detectedCount;
//     urlDoc.severity = detectedCount > 0 ? finalSeverity : 'safe';
//     await urlDoc.save();

//     if(logger && logger.info) logger.info(`Scan completed successfully for ID: ${urlDoc._id}`);
    
//     // 🔥 إرسال الإيميل (الآن سيعمل لأن urlDoc.user ممتلئ بالبيانات) 🔥
//     if (urlDoc.user && urlDoc.user.email) {
//       try {
//         // رابط التقرير في الفرونت إند
//         const reportLink = `http://localhost:4200/result/${urlId}`;
        
//         // نص الرسالة العادي
//         const message = `Scan finished for ${urlDoc.originalUrl}. We found ${detectedCount} issues.`;
        
//         await sendEmail({
//             email: urlDoc.user.email,
//             subject: '🔍 Security Scan Completed',
//             message: message, // ده بيظهر لو الإيميل مش بيدعم HTML (نادر جداً)
            
//             // 🔥 تصميم الـ HTML (حسنت الشكل شوية عشان الرقم يظهر)
//             html: `
//               <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #eee; border-radius: 10px;">
//                 <h2 style="color: #4c6ef5;">Scan Completed Successfully!</h2>
//                 <p>Hello,</p>
//                 <p>The security scan for target: <strong>${urlDoc.originalUrl}</strong> has finished.</p>
                
//                 <p style="font-size: 16px;">
//                    Total Issues Found: <strong style="color: #ff003c; font-size: 18px;">${detectedCount}</strong>
//                 </p>

//                 <p>You can view the full detailed report on your dashboard.</p>
//                 <br>
//                 <div style="text-align: center; margin: 20px 0;">
//                     <a href="${reportLink}" style="background: #4c6ef5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Full Report</a>
//                 </div>
//                 <br>
//                 <hr style="border: 0; border-top: 1px solid #eee;">
//                 <p style="font-size: 12px; color: #777; text-align: center;">SecuScan Automated System</p>
//               </div>
//             `
//         });
//         // console.log(`✅ Email sent to ${urlDoc.user.email} with count: ${detectedCount}`);
//       } catch (emailError) {
//           console.error("❌ Failed to send email:", emailError.message);
//       }
//     } else {
//         console.warn("⚠️ User email not found.");
//     }

//     return res.status(200).json({
//       message: "Scan completed successfully",
//       reportId: newReport._id,
//       summary: newReport.summary,
//       results: resultsArray
//     });

//   } catch (error) {
//     if(logger && logger.warn) logger.warn(`Scan Error: ${error.message}`);
//     console.error("Scan Error:", error);
    
//     if (req.body.urlId) {
//         await Url.findByIdAndUpdate(req.body.urlId, { status: 'Failed' });
//     }
//     return res.status(500).json({ message: "Internal Server Error", error: error.message });
//   }
// };

// // --- دوال الجلب الإضافية ---

// exports.getAllReports = async (req, res) => {
//   try {
//     const reports = await Report.find()
//       .sort({ scanDate: -1 }) 
//       .populate("url", "originalUrl");
//     res.status(200).json(reports);
//   } catch (error) {
//     res.status(500).json({ message: "Server Error", error: error.message });
//   }
// };

// exports.getReportsByUrl = async (req, res) => {
//   try {
//     const { id } = req.params; // هذا هو urlId
//     const currentUserId = req.user._id; // معرف المستخدم الحالي من التوكن
//     const currentUserRole = req.user.role; // دور المستخدم (للسماح للأدمن)

//     // 1. أولاً: نجلب وثيقة الرابط لنفحص مالكها
//     const urlDoc = await Url.findById(id);

//     if (!urlDoc) {
//         return res.status(404).json({ message: "URL not found" });
//     }

//     // 2. التحقق من الملكية (Authorization Check)
//     // نسمح بالمرور في حالتين:
//     // أ. المستخدم هو صاحب الرابط
//     // ب. المستخدم هو أدمن (Admin)
//     if (urlDoc.user.toString() !== currentUserId.toString() && currentUserRole !== 'admin') {
//         return res.status(403).json({ message: "⛔ Access Denied: You do not own this resource." });
//     }

//     // 3. إذا عبر التحقق، نجلب التقارير
//     const reports = await Report.find({ url: id })
//       .sort({ scanDate: -1 }) 
//       .populate("url", "originalUrl");
      
//     res.status(200).json({ message: "Success", data: reports });

//   } catch (err) {
//     console.error("Get Reports Error:", err);
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.getReportById = async (req, res) => {
//     try {
//         const { reportId } = req.params;
//         const report = await Report.findById(reportId).populate("url", "originalUrl"); 
//         if (!report) return res.status(404).json({ message: "Report not found" });
//         res.status(200).json({ data: report });
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };




const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const logger = require('../utils/logger.utils'); // تأكد من وجوده أو احذفه لو مش عندك
const sendEmail = require('../utils/email.utils'); 

// استدعاء الموديلات
const Url = require("../model/url.model");
const Report = require("../model/results.model"); 
const Vulnerability = require("../model/vulnerability.model");

// استدعاء دوال الذكاء الاصطناعي
const { prepareDataForAI } = require("../aiModel/src/utils/ai-cleaner.utils");
// const { generateReportContent } = require("../aiModel/src/utils/gemini.service");
const { generateReportContent } = require("../aiModel/src/utils/groq.service");
const { enrichFindings, generateReportMetadata } = require("../aiModel/src/utils/risk-scoring.utils");
const { buildFullReportHTML } = require("../aiModel/src/services/report-builder.service");
const { generateAndSavePDF } = require("../aiModel/src/services/pdf.service");

// --- 1. إعداد المسارات ---
const SCRIPTS_DIR = path.join(__dirname, "../vulnerabilityFiles");
const ADVANCED_DIR = path.join(__dirname, "../vulnerabilityFilesAdvanced");
const OUTPUT_DIR = path.join(__dirname, "../scan_results");
const TEMP_DIR = path.join(__dirname, "../temp_payloads");

// إنشاء المجلدات لو مش موجودة
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// --- ترتيب خطورة الثغرات ---
const SEVERITY_RANK = {
  'safe': 0,
  'Low': 1, 'low': 1,
  'Medium': 2,
  'High': 3,
  'Critical': 4
};

// --- 2. دوال المساعدة (Helpers) ---

// let cachedPythonCommand = null;

// function getPythonCommand() {
//     // لو عرفنا الأمر قبل كده، نرجعه علطول ومندورش تاني
//     if (cachedPythonCommand) return cachedPythonCommand;

//     const commandsToCheck = ['python3', 'python', 'py']; 
//     for (const cmd of commandsToCheck) {
//         try {
//             execSync(`${cmd} --version`, { stdio: 'ignore' });
//             cachedPythonCommand = cmd; // احفظ النتيجة
//             return cmd; 
//         } catch (error) { continue; }
//     }
//     // Fallback
//     cachedPythonCommand = process.platform === "win32" ? "py" : "python3";
//     return cachedPythonCommand;
// }

let cachedPythonCommand = null;

function getPythonCommand() {
    if (cachedPythonCommand) return cachedPythonCommand;

    // في لينكس الأولوية لـ python3
    const commandsToCheck = process.platform === "win32" ? ['py', 'python'] : ['python3', 'python']; 
    
    for (const cmd of commandsToCheck) {
        try {
            // بنجرب نجيب المسار الكامل للأمر عشان نضمن إن spawn يشوفه
            const fullPath = execSync(process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`).toString().replace(/\r/g, '').split('\n')[0].trim();
            if (fullPath) {
                console.log(`🔍 Found Python at: [${fullPath}]`);
                cachedPythonCommand = fullPath;
                return fullPath;
            }
        } catch (error) { continue; }
    }
    // Fallback أخير
    cachedPythonCommand = process.platform === "win32" ? "py" : "/usr/bin/python3";
    return cachedPythonCommand;
}



function createTempPayload(targetUrl, vulnId) {
  const filename = `payload_${vulnId}_${Date.now()}.json`;
  const filePath = path.join(TEMP_DIR, filename);
  const taskData = {
    task_id: `scan-${vulnId}`,
    target: { url: targetUrl },
    base_url: targetUrl,
    options: { non_destructive: true },
  };
  fs.writeFileSync(filePath, JSON.stringify(taskData, null, 2));
  return filePath;
}

// function runScriptWorker(scriptFullPath, payloadPath, pythonCmd) {
//   return new Promise((resolve) => {
//     if (!fs.existsSync(scriptFullPath)) {
//       return resolve({ error: "Script file missing", vulnerable: false });
//     }

//     const cmd = pythonCmd || "python"; 
//     const python = spawn(cmd, [
//       "-u", scriptFullPath, "--payload", payloadPath, "--outdir", OUTPUT_DIR
//     ], {
//       cwd: path.dirname(scriptFullPath) // بيخلي "مكان العمل" هو فولدر السكريبت
//     });
    
//     const TIMEOUT_MS = 7 * 60 * 1000; 

// const timeout = setTimeout(() => {
//     python.kill(); // اقتل العملية
//     console.error(`[Timeout] Script took too long: ${scriptFullPath}`);
//     resolve({ error: "Scan timeout exceeded", vulnerable: false });
// }, TIMEOUT_MS);

//     let outputData = "";
    
//     python.stdout.on("data", (data) => { outputData += data.toString(); });
//     python.stderr.on("data", (err) => console.error(`[Py Log]: ${err}`)); 

//     python.on("error", (err) => {
//        console.error(`[Spawn Error]: ${err.message}`);
//        resolve({ error: "Spawn failed", vulnerable: false });
//     });

//     python.on("close", (code) => {
//       clearTimeout(timeout);
//       try { fs.unlinkSync(payloadPath); } catch (e) {} 
//       try {
//         const firstBrace = outputData.indexOf("{");
//         const lastBrace = outputData.lastIndexOf("}");
//         if (firstBrace !== -1 && lastBrace !== -1) {
//             const jsonStr = outputData.substring(firstBrace, lastBrace + 1);
//             resolve(JSON.parse(jsonStr));
//         } else {
//             resolve({ error: "No JSON output", vulnerable: false });
//         }
//       } catch (e) {
//         resolve({ error: "JSON Parse Error", vulnerable: false });
//       }
//     });
//   });
// }

function runScriptWorker(scriptFullPath, payloadPath, pythonCmd) {
  return new Promise((resolve) => {
    if (!fs.existsSync(scriptFullPath)) {
      return resolve({ error: "Script file missing", vulnerable: false });
    }

    // استخدمنا spawn مع المسار الكامل للـ python
    const python = spawn(pythonCmd, [
      "-u", scriptFullPath, "--payload", payloadPath, "--outdir", OUTPUT_DIR
    ], {
      cwd: path.dirname(scriptFullPath),
      env: { ...process.env, PYTHONUNBUFFERED: "1" } // عشان يبعت الـ logs أول بأول
    });
    
// console.log("start scan");




    const TIMEOUT_MS = 7 * 60 * 1000; 
    const timeout = setTimeout(() => {
        python.kill();
        logger.error(`[Timeout] Script took too long: ${scriptFullPath}`);
        resolve({ error: "Scan timeout exceeded", vulnerable: false });
    }, TIMEOUT_MS);

    let outputData = "";
    let errorData = ""; // عشان نجمع أخطاء بايثون
    
    python.stdout.on("data", (data) => { outputData += data.toString(); });
    python.stderr.on("data", (data) => { errorData += data.toString(); }); 

    python.on("close", (code) => {
      clearTimeout(timeout);
      try { fs.unlinkSync(payloadPath); } catch (e) {} 

      if (code !== 0) {
          logger.error(`[Py Error] Script ${path.basename(scriptFullPath)} failed with code ${code}: ${errorData}`);
      }

      try {
        const firstBrace = outputData.indexOf("{");
        const lastBrace = outputData.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonStr = outputData.substring(firstBrace, lastBrace + 1);
            resolve(JSON.parse(jsonStr));
        } else {
            resolve({ error: "No JSON output", pythonError: errorData, vulnerable: false });
        }
      } catch (e) {
        resolve({ error: "JSON Parse Error", rawOutput: outputData, vulnerable: false });
      }
    });
  });
}





exports.scanAll = async (req, res) => {
  try {
    const { urlId } = req.body; 

    if (!urlId) {
        return res.status(400).json({ message: "URL ID is required" });
    }

    // جلب بيانات الرابط واليوزر
    let urlDoc = await Url.findById(urlId).populate('user');

    if (!urlDoc) {
      return res.status(404).json({ message: "URL document not found." });
    }

    const targetUrlString = urlDoc.originalUrl;
    
    console.log(`\n🚀 [SCAN STARTED] Received scan request for URL: ${targetUrlString} (ID: ${urlId})`);
    console.log(`⏳ Please wait, scanning scripts are currently executing...`);
    console.log("`n?? [SCAN STARTED] Received scan request for URL: ${targetUrlString} (ID: ${urlId})");
    console.log("? Please wait, scanning scripts are currently executing...");

    // تحديث الحالة لبدء الفحص
    urlDoc.status = 'Scanning';
    urlDoc.numberOfvuln = 0;
    urlDoc.severity = 'safe';
    await urlDoc.save();

    const vulnerabilities = await Vulnerability.find({ isActive: true });
    if (vulnerabilities.length === 0) {
      urlDoc.status = 'Finished';
      await urlDoc.save();
      return res.status(404).json({ message: "No active vulnerabilities found." });
    }

    const pythonCommand = getPythonCommand();

    // تشغيل الفحص المتوازي
    const scanPromises = vulnerabilities.map(async (vuln) => {
      let scriptFileName = vuln.scriptFile ? vuln.scriptFile : vuln.name.trim() + ".py";
      scriptFileName = path.basename(scriptFileName);
      
      const pathInNormal = path.join(SCRIPTS_DIR, scriptFileName);
      const pathInAdvanced = path.join(ADVANCED_DIR, scriptFileName);
      const payloadPath = createTempPayload(targetUrlString, vuln._id);

      // اختيار المسار الصحيح بناءً على الوجود الفعلي للملف
      let finalScriptPath = null;
      if (fs.existsSync(pathInAdvanced)) {
          finalScriptPath = pathInAdvanced;
      } else if (fs.existsSync(pathInNormal)) {
          finalScriptPath = pathInNormal;
      }

      if (!finalScriptPath) {
          return {
            vulnerabilityId: vuln._id,
            vulnerabilityName: vuln.name,
            severity: vuln.severity,
            isDetected: false,
            technicalDetail: { error: "Script not found in any directory" }
          };
      }

      const scriptResult = await runScriptWorker(finalScriptPath, payloadPath, pythonCommand);

      let isDetected = false;
      if (scriptResult && !scriptResult.error) {
        if (scriptResult.summary && scriptResult.summary.findings_count > 0) isDetected = true;
        else if (scriptResult.vulnerable === true) isDetected = true;
        else if (Array.isArray(scriptResult.findings) && scriptResult.findings.length > 0) isDetected = true;
      }

      return {
        vulnerabilityId: vuln._id,
        vulnerabilityName: vuln.name,
        severity: vuln.severity,
        isDetected: isDetected,
        technicalDetail: scriptResult 
      };
    }); // <--- نهاية الـ map الصحيحة

    // تنفيذ الوعود وانتظار النتائج
    const resultsArray = await Promise.all(scanPromises);

    // الحسابات النهائية للتقرير
    let detectedCount = 0;
    let maxSeverityRank = 0;
    let finalSeverity = 'safe';

    resultsArray.forEach(item => {
      if (item.isDetected) {
        detectedCount++;
        const currentRank = SEVERITY_RANK[item.severity] || 0;
        if (currentRank > maxSeverityRank) {
          maxSeverityRank = currentRank;
          finalSeverity = item.severity;
        }
      }
    });

    // توليد تقرير الذكاء الاصطناعي والـ PDF تلقائياً
    let aiReportContentStr = null;
    let pdfFilename = null;
    let reportMetadata = null;

    try {
      console.log("🤖 Starting AI Report & PDF pipeline...");

      const processedResults = resultsArray.map(vuln => ({
        ...vuln,
        // بنضيف الحقل ده عشان الـ AI يشوفه
        extractedEvidence: vuln.isDetected ? mapScannerDetailToEvidence(vuln) : "N/A"
    }));

      // 1. تنظيف البيانات
      const cleanedData = prepareDataForAI(resultsArray, targetUrlString);
      
      // 2. تحليل الذكاء الاصطناعي
      const aiReportContent = await generateReportContent(targetUrlString, cleanedData);
      aiReportContentStr = JSON.stringify(aiReportContent);
      
      // 3. إثراء البيانات وحساب الميتا داتا
      const enrichedFindings = enrichFindings(cleanedData.findings || []);
      
      // Use AI findings for metadata so executive summary accurately reflects AI's consolidated data
      const finalFindingsForMetadata = (aiReportContent && Array.isArray(aiReportContent.findings)) 
          ? aiReportContent.findings 
          : enrichedFindings;
          
      reportMetadata = generateReportMetadata(finalFindingsForMetadata, targetUrlString);
      reportMetadata.referenceId = `VC-${Date.now()}`;
      reportMetadata.version = 1;

      // 4. بناء الـ HTML
      const fullHtml = buildFullReportHTML(aiReportContent, reportMetadata, enrichedFindings);

      // 5. توليد وحفظ الـ PDF
      const pdfResult = await generateAndSavePDF(fullHtml, targetUrlString, reportMetadata);
      pdfFilename = pdfResult.filename;

      console.log(`✅ PDF Generated: ${pdfFilename}`);
    } catch (aiError) {
      console.error("❌ AI/PDF Pipeline failed:", aiError);
    }

    // حفظ التقرير في الداتابيز
    const newReport = new Report({
        user: urlDoc.user._id || urlDoc.user,
        url: urlDoc._id,
        summary: {
            totalVulnerabilities: detectedCount,
            highestSeverity: finalSeverity
        },
        details: resultsArray,
        aiReportContent: aiReportContentStr,
        pdfFilename: pdfFilename,
        reportMeta: reportMetadata
    });

    await newReport.save();

    // تحديث حالة الرابط النهائية ورابط التقرير
    urlDoc.status = 'Finished';
    urlDoc.numberOfvuln = detectedCount;
    urlDoc.severity = detectedCount > 0 ? finalSeverity : 'safe';
    urlDoc.report = pdfFilename ? `/reports/${pdfFilename}` : null;
    const serverIP = "188.239.55.189"; // الـ IP بتاعك
    await urlDoc.save();

    // إرسال الإيميل للمستخدم
    if (urlDoc.user && urlDoc.user.email) {
      try {
        // const reportLink = `http://localhost:4200/result/${urlId}`;
        const reportLink = `http://${serverIP}:4200/result/${urlId}`;
        await sendEmail({
            email: urlDoc.user.email,
            subject: '🔍 VulnCraft: Security Scan Completed',
            html: `<h3>Your report is ready!</h3><p>Found ${detectedCount} vulnerabilities.</p><a href="${reportLink}">View Full Report</a>`
        });
      } catch (err) { console.error("Email error:", err.message); }
    }

    return res.status(200).json({
      message: "Scan completed successfully",
      reportId: newReport._id,
      summary: newReport.summary,
      results: resultsArray
    });

  } catch (error) {
    console.error("Scan error:", error);
    if (req.body.urlId) await Url.findByIdAndUpdate(req.body.urlId, { status: 'Failed' });
    return res.status(500).json({ message: "Server Error", error: error.message });
  }
};
// --- دوال الجلب الإضافية ---

exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .sort({ scanDate: -1 }) 
      .populate("url", "originalUrl");
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getReportsByUrl = async (req, res) => {
  try {
    const { id } = req.params; // هذا هو urlId
    const currentUserId = req.user._id; // معرف المستخدم الحالي من التوكن
    const currentUserRole = req.user.role; // دور المستخدم (للسماح للأدمن)

    // 1. أولاً: نجلب وثيقة الرابط لنفحص مالكها
    const urlDoc = await Url.findById(id);

    if (!urlDoc) {
        return res.status(404).json({ message: "URL not found" });
    }

    // 2. التحقق من الملكية (Authorization Check)
    // نسمح بالمرور في حالتين:
    // أ. المستخدم هو صاحب الرابط
    // ب. المستخدم هو أدمن (Admin)
    if (urlDoc.user.toString() !== currentUserId.toString() && currentUserRole !== 'admin') {
        return res.status(403).json({ message: "⛔ Access Denied: You do not own this resource." });
    }

    // 3. إذا عبر التحقق، نجلب التقارير
    const reports = await Report.find({ url: id })
      .sort({ scanDate: -1 }) 
      .populate("url", "originalUrl");
      
    res.status(200).json({ message: "Success", data: reports });

  } catch (err) {
    console.error("Get Reports Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getReportById = async (req, res) => {
    try {
        const { reportId } = req.params;
        const report = await Report.findById(reportId).populate("url", "originalUrl"); 
        if (!report) return res.status(404).json({ message: "Report not found" });
        res.status(200).json({ data: report });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};



const mapScannerDetailToEvidence = (vulnerability) => {
    const detail = vulnerability.technicalDetail || {};
    const info = [];

    // 1. فحص الهيدرز المكشوفة
    if (detail.disclosed_headers && detail.disclosed_headers.length > 0) {
        info.push(`Exposed Headers detected: ${detail.disclosed_headers.join(', ')}`);
    }

    // 2. فحص الهيدرز الأمنية الناقصة
    if (detail.missing_headers && detail.missing_headers.length > 0) {
        info.push(`Security Hardening Gap: Missing [${detail.missing_headers.join(', ')}]`);
    }

    // 3. فحص الـ Permissions Policy
    if (detail.check_name === "Permissions Policy" && detail.present === false) {
        info.push("Permissions-Policy header is completely absent from the server response.");
    }

    // 4. فحص مشاكل التشفير (TLS/SSL)
    if (detail.check_name === "TLS Security") {
        if (detail.https_used === false) {
            info.push("Critical: Application is served over plaintext HTTP (No HTTPS).");
        }
        if (detail.reason) {
            info.push(`Encryption Failure Reason: ${detail.reason}`);
        }
    }

    // 5. فحص أخطاء الـ Python (لو السكنر كراش)
    if (detail.pythonError) {
        info.push(`Scanner internal error: ${detail.pythonError.split('\n')[0]}`);
    }

    // لو ملقيناش حاجة نرجع النص الافتراضي
    return info.length > 0 ? info.join(' | ') : "Indicators suggest configuration weakness; manual verification required.";
};


exports.downloadReport = async (req, res) => {
    try {
        const { scanId } = req.params;
        const currentUserId = req.user._id;
        const currentUserRole = req.user.role;

        const Report = require('../model/results.model');
        const report = await Report.findById(scanId);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Security Check
        if (report.user.toString() !== currentUserId.toString() && currentUserRole !== 'admin') {
            return res.status(403).json({ message: 'Access Denied: You do not own this report.' });
        }

        if (!report.pdfFilename) {
            return res.status(404).json({ message: 'PDF is still generating or not available.' });
        }

        const fs = require('fs');
        const path = require('path');
        const pdfPath = path.join(__dirname, '../reports', report.pdfFilename);

        if (!fs.existsSync(pdfPath)) {
            return res.status(404).json({ message: 'PDF file not found on server.' });
        }

        res.download(pdfPath, report.pdfFilename, (err) => {
            if (err) {
                console.error('Error downloading PDF:', err);
                if (!res.headersSent) {
                    res.status(500).json({ message: 'Error downloading file.' });
                }
            }
        });
    } catch (err) {
        console.error('Download Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};
