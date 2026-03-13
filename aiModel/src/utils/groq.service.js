// services/groq.service.js — Enterprise AI Report Generation (OpenRouter API)
// Handles AI communication, JSON extraction, retry logic, and fail-safe output

const axios = require('axios');
const logger = require('../../../utils/logger.utils');
const { REPORT_PROMPT } = require('./prompts');

// Optional concurrency limit could be added here later using p-limit
const MAX_ATTEMPTS = 3;

/**
 * Safely extract JSON from AI response text
 * The AI may include markdown wrappers or extra text around JSON
 */
const parseAIResponse = (rawText) => {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Empty AI response');
    }

    // Try direct parse first
    try {
        return JSON.parse(rawText.trim());
    } catch (e) {
        // Continue to fallback strategies
    }

    // Strategy 1: Extract from markdown code block
    const codeBlockMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
            // Continue
        }
    }

    // Strategy 2: Find first { to last }
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
        } catch (e) {
            // Continue
        }
    }

    // Strategy 3: Try to fix common JSON issues (trailing commas, etc.)
    try {
        const cleaned = rawText
            .substring(firstBrace, lastBrace + 1)
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .replace(/[\x00-\x1F\x7F]/g, ' '); // Remove control characters
        return JSON.parse(cleaned);
    } catch (e) {
        throw new Error(`Failed to parse AI response as JSON. Raw length: ${rawText.length}`);
    }
};

/**
 * Validate parsed AI response has required structure
 */
const validateAIResponse = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return false;
    if (!parsed.executiveSummary) return false;
    if (!Array.isArray(parsed.findings)) return false;
    return true;
};

/**
 * Generate a fallback report structure when AI fails
 */
const generateFallbackReport = (targetUrl, cleanedData, errorMessage) => {
    const findings = cleanedData?.findings || [];

    return {
        executiveSummary: {
            overview: `An automated security assessment was performed against ${targetUrl}. The AI analysis engine encountered an error during report generation. The raw scan data is preserved below for manual review.`,
            securityPostureNarrative: `Due to a processing error (${errorMessage}), the AI-generated narrative could not be completed. Please review the raw findings data and technical evidence for manual analysis.`,
            technologyAnalysis: `Technology stack analysis unavailable due to AI processing error. Manual review of ${targetUrl} recommended to identify server technologies, frameworks, and version-specific risks.`,
            keyObservations: [
                `${findings.length} potential finding(s) detected by automated scanners`,
                'AI analysis was unable to complete — manual review recommended',
                'Raw technical evidence has been preserved in the report appendix'
            ],
            immediateActions: findings.slice(0, 3).map(f => ({
                action: `Review ${f.title} (${f.severity})`,
                rationale: `Automated scanner flagged this as ${f.severity} severity`,
                timeline: 'ASAP',
                assignTo: 'Security Team',
                finding_ref: f.id
            }))
        },
        findings: findings.map(f => ({
            id: f.id,
            title: f.title,
            severity: f.severity,
            riskRating: `Assigned ${f.severity} based on automated scanner classification`,
            affectedComponents: ['See technical evidence'],
            technicalDescription: `Automated scanner detected potential ${f.title}. Evidence confidence: ${f.evidenceConfidence}. Manual validation required.`,
            attackScenario: 'AI analysis unavailable — refer to technical evidence for attack vector assessment.',
            businessImpact: 'Unable to assess business impact automatically. Manual review by security team recommended.',
            complianceImpact: 'Compliance impact assessment unavailable — requires manual review against applicable regulatory frameworks.',
            evidence: (f.evidence || []).map(e => ({
                endpoint: e.url || 'N/A',
                method: e.method || 'N/A',
                parameter: e.param || 'N/A',
                payload: e.payload || 'N/A',
                observation: typeof e.evidence === 'string' ? e.evidence.substring(0, 500) : 'See raw data'
            })),
            remediation: {
                recommendation: 'Validate finding manually before implementing remediation',
                technicalFix: 'Pending manual validation',
                quickWin: 'Verify finding manually and apply vendor-recommended patches if applicable.',
                references: []
            },
            mitreAttack: [],
            exploitReferences: [],
            defenseInDepth: [],
            verificationSteps: [
                'Validate the finding manually using a security testing tool',
                'Attempt to reproduce the vulnerability with the provided evidence',
                'If confirmed, apply the remediation steps',
                'Rerun the automated scan to verify the fix'
            ],
            residualRisk: 'Unknown — requires manual assessment after AI analysis is available.'
        })),
        strategicRecommendations: [{
            area: 'Manual Review',
            recommendation: 'Conduct manual security testing to validate automated scan findings',
            businessBenefit: 'Reduces false positive remediation effort and confirms actual risk exposure',
            estimatedEffort: '2-4 hours per finding',
            toolsRequired: 'Burp Suite, OWASP ZAP, or manual browser testing'
        }],
        securityProgramImprovements: [{
            phase: 'Short-Term (0-3 months)',
            initiative: 'Validate all automated findings through manual penetration testing',
            expectedOutcome: 'Confirmed vulnerability inventory with accurate risk ratings',
            estimatedCost: 'Internal resource allocation',
            dependencies: 'Security team availability and testing environment access'
        }],
        _meta: {
            aiStatus: 'FALLBACK',
            errorMessage
        }
    };
};

/**
 * Main function: Generate structured report content via Groq API
 * Returns parsed JSON object (not string)
 */
exports.generateReportContent = async (targetUrl, cleanedData) => {
    // Sanitize targetUrl to prevent basic prompt injections
    const safeTargetUrl = typeof targetUrl === 'string' ? targetUrl.replace(/[\r\n<>"]/g, '') : '';

    // Allow empty findings (generates "no vulns found" report)
    if (!cleanedData || typeof cleanedData !== 'object') {
        throw new Error('No valid scan data provided to AI');
    }

    const prompt = REPORT_PROMPT
        .replace('{{DATA}}', JSON.stringify(cleanedData.findings || [], null, 2))
        .replace('{{TARGET_URL}}', safeTargetUrl)
        .replace('{{DATE}}', new Date().toISOString().split('T')[0]);

        // AI API Configuration (OpenRouter / Groq compatible)
        const apiUrl = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
        const apiKey = process.env.GROQ_API_KEY;
        const aiModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

        if (!apiKey) {
            logger?.error('❌ AI API Key is not set in .env (GROQ_API_KEY)');
            return generateFallbackReport(targetUrl, cleanedData, 'AI API Key is not configured in .env');
        }

        let lastError = null;
        const aiStartTime = Date.now();

        const MAX_ATTEMPTS = 5;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            const attemptStart = Date.now();
            try {
                logger?.info(`🤖 [AI] Attempt ${attempt}/${MAX_ATTEMPTS} — Model: ${aiModel} — Target: ${safeTargetUrl}`);

                const response = await axios.post(
                    apiUrl,
                    {
                        model: aiModel,
                        messages: [
                            {
                                role: 'system',
                                content: `You are a Principal Penetration Tester (OSCP, OSCE, GXPN) with 20+ years of offensive security experience at Big 4 consultancies.

CRITICAL RULES:
- Output ONLY valid JSON. Start with { end with }. Zero text outside JSON.
- Use ONLY provided scan data. NEVER fabricate findings, endpoints, or evidence.
- Preserve exact riskScore, severity, and priority values from input data.
- technicalDescription: 1-2 sentences MAXIMUM. No verbose text.
- attackScenario: 1-2 sentences MAXIMUM. Keep narrative brief.
- businessImpact: 1-2 sentences MAXIMUM. MUST BE PROPORTIONAL to severity. Do not use extreme metrics (like $165/record loss) for low-severity issues.
- remediation.technicalFix: 5-10 lines BEFORE/AFTER code MAXIMUM.

ANTI-DUPLICATION (CRITICAL):
- Each finding MUST be COMPLETELY UNIQUE — different root cause, different CWE, different attack chain, different code fix, different CVSS vector.
- NEVER copy-paste or recycle text between findings. A missing header is DIFFERENT from a TLS issue.

ANTI-HALLUCINATION (CRITICAL):
- CVE references MUST be directly related to the vulnerability. NEVER reference unrelated CVEs.
- If unsure, write "No directly applicable CVE" instead of fabricating.

LOGICAL CONSISTENCY & CONSOLIDATION:
- Attack scenario tools MUST logically match the vulnerability (e.g. DO NOT use SQLMap for missing headers).
- Mappings (OWASP, CWE, MITRE) MUST be accurate. Missing headers is A05: Security Misconfiguration, NOT A03: Injection. T1059 is Execution, do NOT use it for headers.
- CONSOLIDATE logically overlapping findings (e.g. "Info Disclosure Headers" + "Missing Security Headers" -> single finding "Insecure HTTP Headers"). DO NOT artificially inflate the finding count.

STRUCTURAL INTEGRITY:
- \`executiveSummary.totalFindings\` MUST EXACTLY MATCH the number of items in the \`findings\` array.
- QUALITY OVER BREVITY. Every field must be substantial and detailed.`
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        response_format: { type: 'json_object' },
                        temperature: 0.2,
                        max_tokens: 32000,
                        top_p: 0.85,
                        stream: false
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`,
                            'HTTP-Referer': 'https://vulncraft.io',
                            'X-Title': 'VulnCraft Security Platform'
                        },
                        timeout: 180000,
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity
                    }
                );

                // Extract response — OpenAI-compatible format
                if (!response.data || !response.data.choices || !response.data.choices[0]) {
                    throw new Error('Empty or invalid response from Groq API');
                }

                let rawText = response.data.choices[0].message?.content;
                if (!rawText) {
                    throw new Error('No content in Groq API response');
                }

                // Debug: log response preview on issues
                logger?.info(`📦 Raw response length: ${rawText.length} chars, starts with: ${rawText.substring(0, 80)}...`);

                const finishReason = response.data.choices[0].finish_reason;
                if (finishReason === 'length') {
                    logger?.warn('⚠️ [AI] Response TRUNCATED — max_tokens limit reached. Trying to repair...');
                    let repairedText = rawText.trim();
                    repairedText = repairedText.replace(/,\s*"[^"]*":\s*"?[^}]*$/, '');
                    const openBraces = (repairedText.match(/{/g) || []).length;
                    const closeBraces = (repairedText.match(/}/g) || []).length;
                    const openBrackets = (repairedText.match(/\[/g) || []).length;
                    const closeBrackets = (repairedText.match(/]/g) || []).length;
                    for (let i = 0; i < openBrackets - closeBrackets; i++) repairedText += ']';
                    for (let i = 0; i < openBraces - closeBraces; i++) repairedText += '}';
                    rawText = repairedText;
                }

                const parsed = parseAIResponse(rawText);

                if (!validateAIResponse(parsed)) {
                    throw new Error('AI response missing required fields (executiveSummary, findings)');
                }

                // Log token usage
                const usage = response.data.usage;
                if (usage) {
                    logger?.info(`📊 [AI] Tokens — Prompt: ${usage.prompt_tokens} | Completion: ${usage.completion_tokens} | Total: ${usage.total_tokens}`);
                }

                const attemptDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
                const totalAiDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);
                const findingsCount = parsed.findings?.length || 0;

                logger?.info(`✅ [AI] Report generated — ${findingsCount} findings — ${attemptDuration}s (total: ${totalAiDuration}s)`);
                parsed._meta = { aiStatus: 'SUCCESS', attempt, provider: 'Groq', duration: `${totalAiDuration}s` };
                return parsed;

            } catch (err) {
                lastError = err;
                const attemptDuration = ((Date.now() - attemptStart) / 1000).toFixed(1);
                logger?.warn(`⚠️ [AI] Attempt ${attempt} failed after ${attemptDuration}s: ${err.message}`);

                if (attempt < MAX_ATTEMPTS) {
                    const backoff = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s, 16s
                    logger?.info(`🔄 [AI] Retrying in ${backoff/1000}s...`);
                    await new Promise(r => setTimeout(r, backoff));
                }
            }
        }

        // All retries exhausted — return fallback
        const totalAiDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);
        logger?.error(`❌ [AI] All attempts failed after ${totalAiDuration}s. Using fallback. Error: ${lastError?.message}`);
        return generateFallbackReport(safeTargetUrl, cleanedData, lastError?.message || 'Unknown error');
};

// Export for testing
exports._parseAIResponse = parseAIResponse;
exports._validateAIResponse = validateAIResponse;
