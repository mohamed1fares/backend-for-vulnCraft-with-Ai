// aiModel/src/utils/risk-scoring.utils.js
// Deterministic risk scoring — NOT AI-dependent


const logger = require('../../../utils/logger.utils');


/* ===============================
   SEVERITY & CONFIDENCE WEIGHTS
   =============================== */


const SEVERITY_WEIGHT = {
    Critical: 10,
    High: 8,
    Medium: 5,
    Low: 2
};



const CONFIDENCE_MULTIPLIER = {
    High: 1.0,
    Medium: 0.7,
    Low: 0.4
};



const EXPLOITABILITY_HINTS = {
    'SQL Injection': { likelihood: 'High', complexity: 'Low' },
    'Cross-Site Scripting': { likelihood: 'High', complexity: 'Low' },
    'XSS': { likelihood: 'High', complexity: 'Low' },
    'Remote Code Execution': { likelihood: 'Medium', complexity: 'High' },
    'RCE': { likelihood: 'Medium', complexity: 'High' },
    'Command Injection': { likelihood: 'Medium', complexity: 'Medium' },
    'SSRF': { likelihood: 'Medium', complexity: 'Medium' },
    'Server-Side Request Forgery': { likelihood: 'Medium', complexity: 'Medium' },
    'Path Traversal': { likelihood: 'Medium', complexity: 'Low' },
    'Directory Traversal': { likelihood: 'Medium', complexity: 'Low' },
    'Local File Inclusion': { likelihood: 'Medium', complexity: 'Low' },
    'LFI': { likelihood: 'Medium', complexity: 'Low' },
    'Open Redirect': { likelihood: 'High', complexity: 'Low' },
    'CSRF': { likelihood: 'Medium', complexity: 'Medium' },
    'IDOR': { likelihood: 'High', complexity: 'Low' },
    'Insecure Direct Object Reference': { likelihood: 'High', complexity: 'Low' },
    'Security Misconfiguration': { likelihood: 'High', complexity: 'Low' },
    'Information Disclosure': { likelihood: 'High', complexity: 'Low' },
    'Broken Authentication': { likelihood: 'Medium', complexity: 'Medium' },
    'Sensitive Data Exposure': { likelihood: 'Medium', complexity: 'Low' },
    'XML External Entity': { likelihood: 'Low', complexity: 'High' },
    'XXE': { likelihood: 'Low', complexity: 'High' },
    'CORS Misconfiguration': { likelihood: 'High', complexity: 'Low' },
    'HTTP Header Injection': { likelihood: 'Medium', complexity: 'Low' },
    'Clickjacking': { likelihood: 'High', complexity: 'Low' },
    'Default': { likelihood: 'Medium', complexity: 'Medium' }
};



const LIKELIHOOD_SCORE = { High: 3, Medium: 2, Low: 1 };
const IMPACT_FROM_SEVERITY = { Critical: 4, High: 3, Medium: 2, Low: 1 };



/* ===============================
   CORE SCORING FUNCTIONS
   =============================== */

/**
 * Calculate risk score for a single finding (0-100)
 */
exports.calculateRiskScore = (severity, evidenceConfidence) => {
    const base = SEVERITY_WEIGHT[severity] || 2;
    const multiplier = CONFIDENCE_MULTIPLIER[evidenceConfidence] || 0.5;
    
    // Formula: Base severity weight (2-10) * Confidence Multiplier (0.4-1.0). 
    // Multiply by 10 to scale the raw score (0-10) into a percentage (0-100).
    return Math.min(100, Math.round(base * multiplier * 10));
};

/**
 * Assign remediation priority: P0 (immediate) through P3 (monitor)
 */
exports.assignPriority = (severity, evidenceConfidence) => {
    const score = exports.calculateRiskScore(severity, evidenceConfidence);
    if (score >= 80) return 'P0';
    if (score >= 56) return 'P1';
    if (score >= 30) return 'P2';
    return 'P3';
};

const PRIORITY_LABELS = {
    P0: 'Immediate — Stop and fix before next release',
    P1: 'High — Remediate within current sprint',
    P2: 'Medium — Schedule for next maintenance cycle',
    P3: 'Low — Monitor and address during routine hardening'
};
exports.PRIORITY_LABELS = PRIORITY_LABELS;

/**
 * Get exploitability hints for a vulnerability type
 */
exports.getExploitabilityHints = (vulnName) => {
    if (!vulnName) return EXPLOITABILITY_HINTS['Default'];

    const normalizedName = vulnName.toLowerCase();
    for (const [key, value] of Object.entries(EXPLOITABILITY_HINTS)) {
        if (normalizedName.includes(key.toLowerCase())) {
            return value;
        }
    }
    return EXPLOITABILITY_HINTS['Default'];
};

/**
 * Calculate evidence confidence based on data quality
 */
exports.calculateEvidenceConfidence = (finding) => {
    let score = 0;
    const tech = finding.technicalDetail || {};

    // Has actual findings array with data
    const findings = tech.findings || tech.details || [];
    if (Array.isArray(findings) && findings.length > 0) score += 3;

    // Has specific endpoint URLs
    const hasUrls = Array.isArray(findings) && findings.some(f =>
        (f.detail?.url || f.url) && (f.detail?.url || f.url) !== 'N/A'
    );
    if (hasUrls) score += 2;

    // Has payloads
    const hasPayloads = Array.isArray(findings) && findings.some(f =>
        (f.detail?.payload || f.payload) && (f.detail?.payload || f.payload) !== 'N/A'
    );
    if (hasPayloads) score += 2;

    // Has response evidence
    const hasEvidence = Array.isArray(findings) && findings.some(f =>
        f.detail?.response || f.evidence || f.detail?.evidence
    );
    if (hasEvidence) score += 2;

    // No errors in scan
    if (!tech.error) score += 1;

    if (score >= 7) return 'High';
    if (score >= 4) return 'Medium';
    return 'Low';
};

/* ===============================
   AGGREGATE SCORING
   =============================== */

/**
 * Calculate overall security posture from all findings
 */
exports.calculateSecurityPosture = (enrichedFindings) => {
    if (!enrichedFindings || enrichedFindings.length === 0) {
        return {
            classification: 'Excellent',
            score: 100,
            summary: 'No automated security vulnerabilities were detected within the scope of this assessment.'
        };
    }

    const p0Count = enrichedFindings.filter(f => f.priority === 'P0').length;
    const p1Count = enrichedFindings.filter(f => f.priority === 'P1').length;
    const p2Count = enrichedFindings.filter(f => f.priority === 'P2').length;
    const p3Count = enrichedFindings.filter(f => f.priority === 'P3').length;

    // Start with 100 points, deduct based on priority and count
    const penalty = (p0Count * 30) + (p1Count * 15) + (p2Count * 5) + (p3Count * 2);
    let score = Math.max(1, 100 - penalty);

    let classification;
    if (score >= 90) {
        classification = 'Excellent';
    } else if (score >= 70) {
        classification = 'Good';
    } else if (score >= 40) {
        classification = 'Moderate';
    } else if (score >= 20) {
        classification = 'High Risk';
    } else {
        classification = 'Critical';
    }

    // Enforce caps based on critical findings
    if (p0Count > 0 && score >= 20) {
        classification = 'Critical';
        score = Math.min(score, 19);
    } else if (p1Count > 0 && score >= 40) {
        classification = 'High Risk';
        score = Math.min(score, 39);
    }

    return {
        classification,
        score,
        summary: `${enrichedFindings.length} security finding(s) identified. ` +
            `${p0Count} require immediate attention, ${p1Count} are high priority.`
    };
};

/**
 * Generate severity distribution counts
 */
exports.generateSeverityDistribution = (enrichedFindings) => {
    const dist = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const f of enrichedFindings) {
        const sev = f.severity || 'Low';
        if (dist[sev] !== undefined) dist[sev]++;
    }
    return dist;
};

/**
 * Generate risk matrix data (Impact × Likelihood grid)
 */
exports.generateRiskMatrix = (enrichedFindings) => {
    // 4×3 matrix: Impact (Critical/High/Medium/Low) × Likelihood (High/Medium/Low)
    const matrix = {};
    const impacts = ['Critical', 'High', 'Medium', 'Low'];
    const likelihoods = ['High', 'Medium', 'Low'];

    for (const impact of impacts) {
        matrix[impact] = {};
        for (const likelihood of likelihoods) {
            matrix[impact][likelihood] = [];
        }
    }

    for (const f of enrichedFindings) {
        const impact = f.severity || 'Low';
        let likelihood = f.exploitability?.likelihood;
        if (!likelihood) {
            likelihood = exports.getExploitabilityHints(f.title).likelihood || 'Medium';
        }
        if (matrix[impact] && matrix[impact][likelihood]) {
            matrix[impact][likelihood].push(f.id);
        }
    }

    return matrix;
};

/**
 * Enrich a cleaned findings array with risk metadata
 * This is used either as a fallback, or to ensure completeness of AI findings.
 */
exports.enrichFindings = (cleanedFindings) => {
    if (!cleanedFindings || !Array.isArray(cleanedFindings)) return [];

    return cleanedFindings.map(finding => {
        const exploitability = exports.getExploitabilityHints(finding.title);
        
        // We now get riskScore and priority from the AI's output (if passed here).
        // If they are missing (e.g. fallback mode), we calculate them deterministically.
        const riskScore = finding.riskScore !== undefined ? finding.riskScore : exports.calculateRiskScore(finding.severity || 'Low', finding.evidenceConfidence || 'Low');
        
        // If the AI didn't provide a priority, assign one based on the newly validated or calculated riskScore
        let priority = finding.priority;
        if (!priority) {
            if (riskScore >= 80) priority = 'P0';
            else if (riskScore >= 56) priority = 'P1';
            else if (riskScore >= 30) priority = 'P2';
            else priority = 'P3';
        }

        return {
            ...finding,
            riskScore,
            priority,
            priorityLabel: PRIORITY_LABELS[priority],
            exploitability
        };
    });
};

/**
 * Generate full report metadata (non-AI, deterministic)
 */
exports.generateReportMetadata = (enrichedFindings, targetUrl) => {
    const posture = exports.calculateSecurityPosture(enrichedFindings);
    const distribution = exports.generateSeverityDistribution(enrichedFindings);
    const matrix = exports.generateRiskMatrix(enrichedFindings);

    const referenceId = `VC-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    return {
        referenceId,
        generatedAt: new Date().toISOString(),
        targetUrl,
        classification: 'CONFIDENTIAL',
        version: 1,
        securityPosture: posture,
        severityDistribution: distribution,
        riskMatrix: matrix,
        totalFindings: enrichedFindings.length,
        p0Count: enrichedFindings.filter(f => f.priority === 'P0').length,
        p1Count: enrichedFindings.filter(f => f.priority === 'P1').length,
        p2Count: enrichedFindings.filter(f => f.priority === 'P2').length,
        p3Count: enrichedFindings.filter(f => f.priority === 'P3').length
    };
};
