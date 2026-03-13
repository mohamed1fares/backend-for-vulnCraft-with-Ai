// services/pdf.service.js — Enterprise PDF Generator
// Accepts pre-built HTML from report-builder.service.js and renders to PDF via Puppeteer
// Includes retry logic for resilience against Puppeteer crashes

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const logger = require('../../../utils/logger.utils');

/* ===============================
   SINGLETON BROWSER
   =============================== */

let sharedBrowser = null;

const getBrowser = async () => {
    if (!sharedBrowser || !sharedBrowser.isConnected()) {
        const potentialPaths = [
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            process.env.CHROME_PATH // Allow override via .env
        ].filter(Boolean);

        let executablePath = null;
        for (const p of potentialPaths) {
            if (fs.existsSync(p)) {
                executablePath = p;
                break;
            }
        }

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };

        if (executablePath) {
            launchOptions.executablePath = executablePath;
            logger?.info(`🌐 Using Chrome at: ${executablePath}`);
        } else {
            logger?.info('🌐 Chrome path not found, letting Puppeteer use default/cache');
        }

        sharedBrowser = await puppeteer.launch(launchOptions);
    }
    return sharedBrowser;
};

const resetBrowser = async () => {
    if (sharedBrowser) {
        try { await sharedBrowser.close(); } catch { }
        sharedBrowser = null;
    }
};

// Graceful shutdown — prevent leaked Chrome processes
process.on('SIGTERM', async () => { await resetBrowser(); });
process.on('SIGINT', async () => { await resetBrowser(); });
process.on('exit', () => { if (sharedBrowser) { try { sharedBrowser.close(); } catch {} } });

/* ===============================
   COMPANY NAME HELPER
   =============================== */

const { getCompanyName } = require('./report-builder.service');

/* ===============================
   PDF RENDER (single attempt)
   =============================== */

const renderPDF = async (fullHtml, reportPath, metadata) => {
    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await page.setContent(fullHtml, {
            waitUntil: 'domcontentloaded',
            timeout: 180000
        });

        // Brief wait for CSS rendering
        await new Promise(r => setTimeout(r, 500));

        const classification = metadata.classification || 'CONFIDENTIAL';
        const referenceId = metadata.referenceId || '';

        await page.pdf({
            path: reportPath,
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: `
                <div style="font-size: 8px; font-family: Helvetica, Arial, sans-serif; color: #9ca3af; width: 100%; padding: 0 40px; display: flex; justify-content: space-between;">
                    <span>${classification}</span>
                    <span>${referenceId}</span>
                </div>
            `,
            footerTemplate: `
                <div style="font-size: 8px; font-family: Helvetica, Arial, sans-serif; color: #6b7280; width: 100%; border-top: 1px solid #e5e7eb; padding-top: 4px; margin: 0 40px; display: flex; justify-content: space-between;">
                    <span>VulnCraft Security Assessment | ${classification}</span>
                    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
                </div>
            `,
            margin: {
                top: '50px',
                bottom: '60px',
                left: '40px',
                right: '40px'
            }
        });

        await page.close();
        return true;

    } catch (error) {
        if (page) await page.close().catch(() => { });

        // Reset browser on crash-type errors
        if (
            error.message?.includes('Target closed') ||
            error.message?.includes('Protocol error') ||
            error.message?.includes('Session closed') ||
            error.message?.includes('Navigation timeout')
        ) {
            await resetBrowser();
        }

        throw error;
    }
};

/* ===============================
   MAIN PDF GENERATOR (with retry)
   =============================== */

const MAX_PDF_RETRIES = 2;

/**
 * Generate PDF from pre-built HTML with retry logic
 * @param {string} fullHtml - Complete HTML document from report-builder.service.js
 * @param {string} targetUrl - Target URL for filename generation
 * @param {Object} metadata - Report metadata (referenceId, classification, version)
 * @returns {Object} { filename, reportPath }
 */
exports.generateAndSavePDF = async (fullHtml, targetUrl, metadata = {}) => {
    /* ================= VALIDATION ================= */
    if (!fullHtml || fullHtml.length < 200) {
        throw new Error('Invalid or incomplete report HTML content');
    }

    /* ================= DIRECTORIES ================= */
    const reportsDir = path.join(__dirname, '../../../reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    /* ================= FILE NAME ================= */
    let baseFilename;
    
    // We dynamically extract the scan ID (urlId) from the database to name the PDF after it.
    // This allows the frontend to easily fetch the PDF predictably using /result/:urlId.
    try {
        const Report = require('../../../model/results.model');
        const Url = require('../../../model/url.model');
        
        // Find the URL document that matches our targetUrl to be precise
        const urlDoc = await Url.findOne({ originalUrl: targetUrl }).sort({ _id: -1 });
        
        if (urlDoc) {
             baseFilename = urlDoc._id.toString(); // Extract the urlId!
        } else {
             // Fallback: Just grab the newest report's URL
             const latestReport = await Report.findOne().sort({ _id: -1 });
             if (latestReport && latestReport.url) {
                 baseFilename = latestReport.url.toString(); 
             }
        }
    } catch (error) {
        logger?.error('Failed to extract Scan ID for PDF naming:', error.message);
    }

    // The filename will now just be exactly the ID with .pdf, with a safe fallback
    baseFilename = baseFilename || metadata.referenceId || `Report_${Date.now()}`;
    let filename = `${baseFilename}.pdf`;
    let reportPath = path.join(reportsDir, filename);

    // Delete existing file if it already exists to overwrite it
    if (fs.existsSync(reportPath)) {
        try {
            fs.unlinkSync(reportPath);
            logger?.info(`🗑️ Deleted existing PDF to overwrite: ${filename}`);
        } catch (err) {
            logger?.warn(`⚠️ Could not delete existing PDF ${filename}: ${err.message}`);
        }
    }

    /* ================= RENDER WITH RETRY ================= */
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_PDF_RETRIES + 1; attempt++) {
        try {
            logger?.info(`📄 PDF render attempt ${attempt}/${MAX_PDF_RETRIES + 1}`);
            await renderPDF(fullHtml, reportPath, metadata);

            logger?.info(`✅ PDF Generated: ${filename}`);
            return { filename, reportPath };

        } catch (error) {
            lastError = error;
            logger?.warn(`⚠️ PDF attempt ${attempt} failed: ${error.message}`);

            if (attempt <= MAX_PDF_RETRIES) {
                logger?.info(`🔄 Retrying PDF generation in 1 second...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    logger?.error(`❌ All PDF attempts failed: ${lastError?.message}`);
    throw lastError;
};