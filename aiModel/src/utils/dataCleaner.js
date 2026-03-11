exports.prepareDataForAI = (scanDetails) => {
    if (!scanDetails || !Array.isArray(scanDetails)) return [];

    return scanDetails.map(vuln => {
        // استخراج البيانات بناءً على هيكل ملف الـ JSON اللي رفعته
        const summary = vuln.technicalDetail?.summary || {};
        
        return {
            title: vuln.vulnerabilityName || "Unknown Vulnerability",
            severity: vuln.severity || "Low",
            count: summary.findings_count || 0,
            // بناخد عينة (3 روابط) عشان الموديل ميهنجش
            affected_samples: summary.findings 
                ? summary.findings.slice(0, 3).map(f => ({
                    url: f.url || f.detail?.url || "N/A",
                    method: f.method || f.detail?.method || "GET",
                    param: f.param || (f.detail?.params ? f.detail.params.join(', ') : "N/A")
                })) 
                : []
        };
    });
};