// utils/ai-cleaner.utils.js
exports.prepareDataForAI = (scanDetails) => {
    if (!scanDetails || !Array.isArray(scanDetails)) return [];

    return scanDetails.map(vuln => {
        // استخراج البيانات بناءً على هيكل results.model.js ومخرجات البايثون
        const techSummary = vuln.technicalDetail?.summary || {};
        
        return {
            title: vuln.vulnerabilityName || "Unknown Vulnerability",
            severity: vuln.severity || "Low",
            count: techSummary.findings_count || 0,
            // بناخد عينة من أول 3 روابط مصابة فقط لتقليل حجم الداتا
            samples: techSummary.findings 
                ? techSummary.findings.slice(0, 3).map(f => {
                    // دعم لهياكل البيانات المختلفة (SQLMap vs Custom Script)
                    const detail = f.detail || f; 
                    return {
                        url: detail.url || "N/A",
                        method: detail.method || "GET",
                        param: detail.params ? detail.params.toString() : (detail.param || "N/A")
                    };
                }) 
                : []
        };
    });
};