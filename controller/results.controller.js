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

// --- 1. إعداد المسارات ---
const SCRIPTS_DIR = path.join(__dirname, "../vulnerabilityFiles");
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

let cachedPythonCommand = null;

function getPythonCommand() {
    // لو عرفنا الأمر قبل كده، نرجعه علطول ومندورش تاني
    if (cachedPythonCommand) return cachedPythonCommand;

    const commandsToCheck = ['python3', 'python', 'py']; 
    for (const cmd of commandsToCheck) {
        try {
            execSync(`${cmd} --version`, { stdio: 'ignore' });
            cachedPythonCommand = cmd; // احفظ النتيجة
            return cmd; 
        } catch (error) { continue; }
    }
    // Fallback
    cachedPythonCommand = process.platform === "win32" ? "py" : "python3";
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

function runScriptWorker(scriptFullPath, payloadPath, pythonCmd) {
  return new Promise((resolve) => {
    if (!fs.existsSync(scriptFullPath)) {
      return resolve({ error: "Script file missing", vulnerable: false });
    }

    const cmd = pythonCmd || "python"; 
    const python = spawn(cmd, [
      "-u", scriptFullPath, "--payload", payloadPath, "--outdir", OUTPUT_DIR
    ]);

    const TIMEOUT_MS = 7 * 60 * 1000; 

const timeout = setTimeout(() => {
    python.kill(); // اقتل العملية
    console.error(`[Timeout] Script took too long: ${scriptFullPath}`);
    resolve({ error: "Scan timeout exceeded", vulnerable: false });
}, TIMEOUT_MS);

    let outputData = "";
    
    python.stdout.on("data", (data) => { outputData += data.toString(); });
    python.stderr.on("data", (err) => console.error(`[Py Log]: ${err}`)); 

    python.on("error", (err) => {
       console.error(`[Spawn Error]: ${err.message}`);
       resolve({ error: "Spawn failed", vulnerable: false });
    });

    python.on("close", (code) => {
      clearTimeout(timeout);
      try { fs.unlinkSync(payloadPath); } catch (e) {} 
      try {
        const firstBrace = outputData.indexOf("{");
        const lastBrace = outputData.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonStr = outputData.substring(firstBrace, lastBrace + 1);
            resolve(JSON.parse(jsonStr));
        } else {
            resolve({ error: "No JSON output", vulnerable: false });
        }
      } catch (e) {
        resolve({ error: "JSON Parse Error", vulnerable: false });
      }
    });
  });
}

// --- 3. دالة الفحص الرئيسية (scanAll) ---
exports.scanAll = async (req, res) => {
  try {
    const { urlId } = req.body; 

    if (!urlId) {
        return res.status(400).json({ message: "URL ID is required" });
    }

    // 🔥🔥 التعديل هنا: إضافة .populate('user') 🔥🔥
    let urlDoc = await Url.findById(urlId).populate('user');

    if (!urlDoc) {
      return res.status(404).json({ message: "URL document not found." });
    }

    const targetUrlString = urlDoc.originalUrl;

    // تحديث الحالة
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
    // console.log(`🚀 Starting Scan using [${pythonCommand}] for: ${targetUrlString} (ID: ${urlId})`);

    // تشغيل الفحص
    const scanPromises = vulnerabilities.map(async (vuln) => {
      let scriptFileName = vuln.scriptFile ? vuln.scriptFile : vuln.name.trim() + ".py";
      scriptFileName = path.basename(scriptFileName);
      
      const scriptFullPath = path.join(SCRIPTS_DIR, scriptFileName);
      const payloadPath = createTempPayload(targetUrlString, vuln._id);

      const scriptResult = await runScriptWorker(scriptFullPath, payloadPath, pythonCommand);

      let isDetected = false;
      if (scriptResult && !scriptResult.error) {
        if (scriptResult.summary && scriptResult.summary.findings_count > 0) isDetected = true;
        else if (scriptResult.vulnerable === true) isDetected = true;
        else if (Array.isArray(scriptResult.findings) && scriptResult.findings.length > 0) isDetected = true;
      }

      // console.log(`Checking ${vuln.name}: ${isDetected ? "DETECTED 🔴" : "Safe 🟢"}`);

      return {
        vulnerabilityId: vuln._id,
        vulnerabilityName: vuln.name,
        severity: vuln.severity,
        isDetected: isDetected,
        technicalDetail: scriptResult 
      };
    });

    const resultsArray = await Promise.all(scanPromises);

    // الحسابات النهائية
    let detectedCount = 0;
    let maxSeverityRank = 0;
    let finalSeverity = 'safe';

    resultsArray.forEach(item => {
      if (item.isDetected) {
        detectedCount++;
        const currentRank = SEVERITY_RANK[item.severity] || 0;
        if (currentRank > maxSeverityRank) {
          maxSeverityRank = currentRank;
          finalSeverity = item.severity === 'Low' ? 'low' : item.severity;
        }
      }
    });

    // حفظ التقرير
    const newReport = new Report({
        url: urlDoc._id,
        summary: {
            totalVulnerabilities: detectedCount,
            highestSeverity: finalSeverity
        },
        details: resultsArray
    });

    await newReport.save();

    // تحديث الرابط
    urlDoc.status = 'Finished';
    urlDoc.numberOfvuln = detectedCount;
    urlDoc.severity = detectedCount > 0 ? finalSeverity : 'safe';
    await urlDoc.save();

    if(logger && logger.info) logger.info(`Scan completed successfully for ID: ${urlDoc._id}`);
    
    // 🔥 إرسال الإيميل (الآن سيعمل لأن urlDoc.user ممتلئ بالبيانات) 🔥
    if (urlDoc.user && urlDoc.user.email) {
      try {
        // رابط التقرير في الفرونت إند
        const reportLink = `http://localhost:4200/result/${urlId}`;
        
        // نص الرسالة العادي
        const message = `Scan finished for ${urlDoc.originalUrl}. We found ${detectedCount} issues.`;
        
        await sendEmail({
            email: urlDoc.user.email,
            subject: '🔍 Security Scan Completed',
            message: message, // ده بيظهر لو الإيميل مش بيدعم HTML (نادر جداً)
            
            // 🔥 تصميم الـ HTML (حسنت الشكل شوية عشان الرقم يظهر)
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #4c6ef5;">Scan Completed Successfully!</h2>
                <p>Hello,</p>
                <p>The security scan for target: <strong>${urlDoc.originalUrl}</strong> has finished.</p>
                
                <p style="font-size: 16px;">
                   Total Issues Found: <strong style="color: #ff003c; font-size: 18px;">${detectedCount}</strong>
                </p>

                <p>You can view the full detailed report on your dashboard.</p>
                <br>
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${reportLink}" style="background: #4c6ef5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Full Report</a>
                </div>
                <br>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #777; text-align: center;">SecuScan Automated System</p>
              </div>
            `
        });
        // console.log(`✅ Email sent to ${urlDoc.user.email} with count: ${detectedCount}`);
      } catch (emailError) {
          console.error("❌ Failed to send email:", emailError.message);
      }
    } else {
        console.warn("⚠️ User email not found.");
    }

    return res.status(200).json({
      message: "Scan completed successfully",
      reportId: newReport._id,
      summary: newReport.summary,
      results: resultsArray
    });

  } catch (error) {
    if(logger && logger.warn) logger.warn(`Scan Error: ${error.message}`);
    console.error("Scan Error:", error);
    
    if (req.body.urlId) {
        await Url.findByIdAndUpdate(req.body.urlId, { status: 'Failed' });
    }
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
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