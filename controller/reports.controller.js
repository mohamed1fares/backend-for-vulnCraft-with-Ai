/**
 * GET /api/report/:scanId/data
 * بيجيب بيانات التقرير (JSON) بعد معالجتها بالـ AI للفرونت إند
 */
exports.getReportData = async (req, res) => {
    const { scanId } = req.params;
    const { reanalyze } = req.query;

    try {
        const scan = await Report.findById(scanId).populate('url');
        if (!scan) return res.status(404).json({ message: 'Scan not found' });

        // التحقق من الملكية (Security)
        if (!scan.user || scan.user.toString() !== req.user?.id) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }

        const targetUrl = scan.url?.originalUrl;
        const shouldReanalyze = reanalyze === 'true';
        let aiReport = null;

        // 1. فحص الكاش (هل التقرير معمول قبل كدة؟)
        if (!shouldReanalyze && scan.aiReportContent) {
            try { aiReport = JSON.parse(scan.aiReportContent); } catch { }
        }

        // 2. لو مش موجود، شغله بالـ AI حالاً
        if (!aiReport) {
            const scanDetails = Array.isArray(scan.details) ? scan.details : [];
            const processedDetails = scanDetails.map(vuln => ({
                ...vuln.toObject(),
                extractedEvidence: vuln.isDetected ? mapScannerDetailToEvidence(vuln) : "N/A"
            }));
            
            const cleanedData = prepareDataForAI(processedDetails, targetUrl);
            aiReport = await generateReportContent(targetUrl, cleanedData);

            // حفظ في الداتابيز
            scan.aiReportContent = JSON.stringify(aiReport);
            await scan.save();
        }

        // 3. ابعت البيانات للفرونت إند
        return res.status(200).json({
            success: true,
            data: aiReport,
            metadata: scan.reportMeta
        });

    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch report data', error: error.message });
    }
};