// controllers/reportController.js — Enterprise Report Controller
// Orchestrates the full pipeline: scan data → AI analysis → report building → PDF generation

const fs = require('fs');
const path = require('path');
const Report = require('../../../model/results.model');
const logger = require('../../../utils/logger.utils');
const { prepareDataForAI } = require('../utils/ai-cleaner.utils');
// const { generateReportContent } = require('../utils/gemini.service');
const { generateReportContent } = require('../utils/groq.service');
const { enrichFindings, generateReportMetadata } = require('../utils/risk-scoring.utils');
const { buildFullReportHTML } = require('../services/report-builder.service');
const { generateAndSavePDF } = require('../services/pdf.service');
const { mapScannerDetailToEvidence } = require('../services/report-builder.service');
/**
 * Generate report reference ID
 */
const generateReferenceId = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = String(Math.floor(Math.random() * 9000) + 1000);
    return `VC-${dateStr}-${randomPart}`;
};

/**
 * GET /api/report/:scanId
 * Query params:
 *   ?regenerate=true  — Force PDF regeneration (from cached AI content)
 *   ?reanalyze=true   — Re-run AI analysis AND regenerate PDF
 */
exports.generateAndDownloadPDF = async (req, res) => {
    const { scanId } = req.params;
    const { regenerate, reanalyze } = req.query;

    try {
        logger?.info(`📄 Report request | ScanID=${scanId} | User=${req.user?.id || 'unknown'}`);

        /* ===============================
           1️⃣ Load Scan & Authorization
           =============================== */
        const scan = await Report.findById(scanId).populate('url');

        if (!scan) {
            return res.status(404).json({ message: 'Scan not found' });
        }

        // IDOR Protection — deny if no user set or different user
        if (!scan.user || scan.user.toString() !== req.user?.id) {
            logger?.warn(`🔒 IDOR attempt | ScanID=${scanId} | AttempterID=${req.user?.id}`);
            return res.status(403).json({
                message: 'You are not authorized to access this report'
            });
        }

        const targetUrl = scan.url?.originalUrl || 'Target Website';

        /* ===============================
           2️⃣ Prepare & Enrich Data
           =============================== */
           const scanDetails = Array.isArray(scan.details) ? scan.details : [];

           // --- التعديل هنا ---
           const processedDetails = scanDetails.map(vuln => ({
               ...vuln.toObject(), // مهم نستخدم toObject لو الداتا جاية من Mongoose
               extractedEvidence: vuln.isDetected ? mapScannerDetailToEvidence(vuln) : "N/A"
           }));
           
           const cleanedData = prepareDataForAI(processedDetails, targetUrl);

            const enrichedFindings = enrichFindings(cleanedData.findings || []);

        /* ===============================
           3️⃣ AI Analysis (with caching)
           =============================== */
        const shouldReanalyze = reanalyze === true || reanalyze === 'true';
        let aiReport = null;

        // Try to use cached AI report
        if (!shouldReanalyze && scan.aiReportContent && scan.aiReportContent.length > 200) {
            try {
                aiReport = JSON.parse(scan.aiReportContent);
                if (!aiReport.executiveSummary || !Array.isArray(aiReport.findings)) {
                    aiReport = null; // Invalid cache, regenerate
                } else {
                    logger?.info('🚀 Using cached AI report');
                }
            } catch {
                aiReport = null; // Parse failed, regenerate
            }
        }

        // Run AI analysis if needed
        if (!aiReport) {
            logger?.info('🤖 Running AI analysis');

            aiReport = await generateReportContent(targetUrl, cleanedData);

            // Validate AI response
            if (!aiReport || !aiReport.executiveSummary) {
                throw new Error('AI report generation produced invalid output');
            }

            // Cache the structured JSON in DB
            scan.aiReportContent = JSON.stringify(aiReport);
            await scan.save();
            logger?.info('💾 AI report cached to database');
        }

        /* ===============================
           4️⃣ Generate Report Metadata
           =============================== */
        // Use AI findings for metadata so executive summary accurately reflects AI's output
        const finalFindingsForMetadata = (aiReport && Array.isArray(aiReport.findings)) 
            ? aiReport.findings 
            : enrichedFindings;
            
        const metadata = generateReportMetadata(finalFindingsForMetadata, targetUrl);

        // Reuse stored reference ID for consistency, or generate new one
        if (scan.reportMeta?.referenceId && !shouldReanalyze) {
            metadata.referenceId = scan.reportMeta.referenceId;
        } else if (!scan.reportMeta?.referenceId) {
            metadata.referenceId = generateReferenceId();
        }

        // Version management
        if (scan.reportMeta?.version) {
            metadata.version = shouldReanalyze
                ? scan.reportMeta.version + 1
                : scan.reportMeta.version;
        } else {
            metadata.version = 1;
        }

        // Persist metadata to DB
        scan.reportMeta = {
            referenceId: metadata.referenceId,
            version: metadata.version,
            classification: metadata.classification,
            securityPosture: metadata.securityPosture,
            totalFindings: metadata.totalFindings,
            severityDistribution: metadata.severityDistribution
        };
        await scan.save();
        logger?.info(`💾 Report metadata persisted | Ref=${metadata.referenceId} v${metadata.version}`);

        /* ===============================
           5️⃣ Build HTML Report
           =============================== */
        const fullHtml = buildFullReportHTML(aiReport, metadata, enrichedFindings);

        /* ===============================
           6️⃣ PDF Generation (with caching)
           =============================== */
        const reportsDir = path.join(__dirname, '../../../reports');
        let reportPath = null;

        if (scan.pdfFilename) {
            reportPath = path.join(reportsDir, scan.pdfFilename);
        }

        const shouldRegeneratePDF =
            regenerate === true || regenerate === 'true' ||
            shouldReanalyze ||
            !reportPath ||
            !(fs.existsSync(reportPath));

        if (shouldRegeneratePDF) {
            logger?.info('📄 Generating PDF');

            const result = await generateAndSavePDF(fullHtml, targetUrl, metadata);
            scan.pdfFilename = result.filename;
            await scan.save();
            reportPath = result.reportPath;
        }

        /* ===============================
           7️⃣ Final Safety Check
           =============================== */
        if (!reportPath || !(fs.existsSync(reportPath))) {
            throw new Error('PDF file not found after generation');
        }

        /* ===============================
           8️⃣ Audit Trail
           =============================== */
        logger?.info(`📊 Report Download | Ref=${metadata.referenceId} | Version=${metadata.version} | User=${req.user?.id} | Scan=${scanId} | Posture=${metadata.securityPosture?.classification}`);

        /* ===============================
           9️⃣ Serve File
           =============================== */
        return res.download(reportPath);

    } catch (error) {
        logger?.error(`💥 Report Error | Scan=${scanId} | ${error.message}`);
        return res.status(500).json({
            message: 'Report generation failed',
            error: error.message
        });
    }
};
