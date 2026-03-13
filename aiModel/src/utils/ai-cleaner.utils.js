// utils/ai-cleaner.utils.js — Enterprise-Grade Data Preparation
// Cleans, structures, and enriches scan results before AI analysis

const logger = require('../../../utils/logger.utils');
const {
    calculateEvidenceConfidence,
    getExploitabilityHints,
    calculateRiskScore,
    assignPriority,
    PRIORITY_LABELS
} = require('./risk-scoring.utils');

/**
 * Infer technology stack from URL patterns
 */
const inferTechStack = (targetUrl) => {
    if (!targetUrl) return 'Unknown';
    const url = targetUrl.toLowerCase();
    if (url.includes('.php')) return 'PHP';
    if (url.includes('.asp')) return 'ASP.NET';
    if (url.includes('.jsp') || url.includes('.do')) return 'Java/JSP';
    if (url.includes('.py') || url.includes('django') || url.includes('flask')) return 'Python';
    if (url.includes('node') || url.includes('express')) return 'Node.js';
    if (url.includes('.rb') || url.includes('rails')) return 'Ruby on Rails';
    return 'Unknown';
};

/**
 * Main function: Prepare scan results for AI consumption
 * Filters, cleans, enriches, and structures vulnerability data
 */
exports.prepareDataForAI = (scanDetails, targetUrl) => {
    if (!scanDetails || !Array.isArray(scanDetails)) {
        return { findings: [], metadata: { techStack: inferTechStack(targetUrl), totalScanned: 0 } };
    }

    const techStack = inferTechStack(targetUrl);

    const findings = scanDetails
        .filter(vuln => {
            // Only include detected vulnerabilities
            if (!vuln.isDetected) return false;

            // Filter out scanner errors/artifacts
            const tech = vuln.technicalDetail || {};
            if (tech.error && !tech.findings && !tech.details) return false;

            return true;
        })
        .map((vuln, index) => {
            const tech = vuln.technicalDetail || {};

            // Extract target URL fallback
            const globalUrl = tech.target || tech.url || tech.base_url || 'Target Endpoint';

            // Normalize evidence source
            let sourceData = [];
            if (Array.isArray(tech.findings)) {
                sourceData = tech.findings;
            } else if (tech.summary && Array.isArray(tech.summary.findings)) {
                sourceData = tech.summary.findings;
            } else if (Array.isArray(tech.details)) {
                sourceData = tech.details;
            } else if (tech.details) {
                sourceData = [tech.details];
            }

            // Structure evidence items — include ALL evidence (no truncation)
            const structuredEvidence = sourceData
                .filter(item => {
                    // Filter out error entries from evidence
                    const detail = item.detail || item;
                    const evidence = detail.response || detail.evidence || item.evidence || '';
                    const url = detail.url || item.url || '';

                    // Skip entries that are just connection errors
                    if (typeof evidence === 'string' && (
                        evidence.includes('Request error') ||
                        evidence.includes('No connection adapters') ||
                        evidence.includes('ConnectionError')
                    )) return false;

                    if (typeof url === 'string' && url.includes('Request error')) return false;

                    return true;
                })
                .map(item => {
                    let detail = item.detail || item;

                    // Handle nested boolean-based SQLi response structure
                    if (detail.true && detail.true.url) {
                        detail = detail.true;
                    }

                    return {
                        url: detail.url || item.url || globalUrl,
                        method: detail.method || item.method || 'GET',
                        param: detail.param || item.param || detail.parameter || 'N/A',
                        payload: detail.payload || item.payload || 'N/A',
                        evidence: detail.response || item.evidence || detail.evidence || 'See raw scan output'
                    };
                });

            // Recalculate Evidence Confidence using the CLEANED structured evidence
            // instead of the raw nested Python output.
            let confidenceScore = 0;
            if (structuredEvidence.length > 0) confidenceScore += 3;
            if (structuredEvidence.some(e => e.url && e.url !== 'N/A')) confidenceScore += 2;
            if (structuredEvidence.some(e => e.payload && e.payload !== 'N/A')) confidenceScore += 2;
            if (structuredEvidence.some(e => e.evidence && e.evidence !== 'See raw scan output')) confidenceScore += 2;
            if (!tech.error) confidenceScore += 1;
            
            let evidenceConfidence = 'Low';
            if (confidenceScore >= 7) evidenceConfidence = 'High';
            else if (confidenceScore >= 4) evidenceConfidence = 'Medium';

            // Smart Severity Inference: If severity is missing, safe, or low for critical vulns
            // we override it based on the name.
            let severity = vuln.severity;
            const nameLower = (vuln.vulnerabilityName || '').toLowerCase();
            if (!severity || severity === 'safe') {
                severity = 'Low'; // Always at least Low if detected
            }
            if (severity === 'Low' || severity === 'Medium') {
                if (nameLower.includes('sql') || nameLower.includes('rce') || nameLower.includes('command') || nameLower.includes('ssrf') || nameLower.includes('lfi') || nameLower.includes('cmdi')) {
                    severity = 'High';
                } else if (nameLower.includes('xss') || nameLower.includes('cors') || nameLower.includes('csrf') || nameLower.includes('redirect')) {
                    if (severity === 'Low') severity = 'Medium';
                }
            }

            // Get exploitability hints
            const exploitability = getExploitabilityHints(vuln.vulnerabilityName);

            // Include more evidence for AI to write deeper analysis (max 3 items to save tokens)
            const evidenceForAI = structuredEvidence.slice(0, 3);
            const totalEvidenceCount = structuredEvidence.length;

            logger?.info(`[AI-Cleaner] ${vuln.vulnerabilityName}: ${totalEvidenceCount} evidence items, confidence=${evidenceConfidence}`);

            // Attempt to dynamically find the exact vulnerability sub-name from the scan output
            let dynamicTitle = vuln.vulnerabilityName; // Fallback to DB name
            
            if (tech.name) {
                dynamicTitle = tech.name;
            } else if (tech.title) {
                dynamicTitle = tech.title;
            } else if (sourceData.length > 0) {
                // If the scanner outputs an array of findings, try to get the 'type' of the first finding
                const firstFinding = sourceData[0];
                if (firstFinding.type) {
                    // Try to format types like 'sqli_time_based' to 'SQLi Time Based'
                    dynamicTitle = firstFinding.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                } else if (firstFinding.name) {
                    dynamicTitle = firstFinding.name;
                }
            }

            return {
                id: `V-${String(index + 1).padStart(3, '0')}`,
                title: dynamicTitle || 'Unspecified Security Finding',
                severity: severity,
                evidenceConfidence,
                riskScore: calculateRiskScore(severity, evidenceConfidence),
                priority: assignPriority(severity, evidenceConfidence),
                exploitability,
                evidence: evidenceForAI,
                totalEvidenceCount,
                truncated: totalEvidenceCount > 15
            };
        });

    // We no longer sort by riskScore here because the AI has not generated it yet.
    // The AI output should ideally handle sorting, or we can sort later in the controller 
    // when we parse the AI response. For now, we will just send them as they are or sort by severity if needed.
    // We'll trust the AI to process the top findings or we'll truncate raw.

    // Truncate to top MAX findings for AI context window efficiency
    const MAX_FINDINGS_FOR_AI = 50;
    const findingsTruncated = findings.length > MAX_FINDINGS_FOR_AI;
    const truncatedFindings = findings.slice(0, MAX_FINDINGS_FOR_AI);

    return {
        findings: truncatedFindings,
        metadata: {
            techStack,
            totalScanned: scanDetails.length,
            totalDetected: findings.length,
            findingsIncluded: truncatedFindings.length,
            findingsTruncated,
            scanDate: new Date().toISOString().split('T')[0]
        }
    };
};
