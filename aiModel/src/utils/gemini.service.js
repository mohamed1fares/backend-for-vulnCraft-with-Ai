// services/gemini.service.js — Universal AI Report Generation (OpenRouter / OpenAI-compatible)
// Works with OpenRouter, Groq, OpenAI, or any OpenAI-compatible API
// Handles AI communication, JSON extraction, retry logic, and fail-safe output

const axios = require('axios');
const logger = require('../../../utils/logger.utils');
const { REPORT_PROMPT } = require('./prompts');

const MAX_ATTEMPTS = 3;

/**
 * Safely extract JSON from AI response text
 */
const parseAIResponse = (rawText) => {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Empty AI response');
    }

    // Step 1: Try direct parse
    try { return JSON.parse(rawText.trim()); } catch (e) {}

    // Step 2: Strip markdown code fences & extract JSON
    let text = rawText.trim()
        .replace(/^```(?:json)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '');
    
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) {
        throw new Error(`No JSON object found. Raw length: ${rawText.length}`);
    }
    text = text.substring(firstBrace, lastBrace + 1);

    // Step 3: Try parsing extracted JSON
    try { return JSON.parse(text); } catch (e) {
        logger?.info(`🔧 [Parser] Direct parse failed at position ${e.message.match(/position (\d+)/)?.[1] || '?'}: ${e.message}`);
    }

    // Step 4: State-machine — escape unescaped newlines/tabs inside JSON strings
    let fixed = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escaped) {
            fixed += ch;
            escaped = false;
            continue;
        }
        if (ch === '\\' && inString) {
            escaped = true;
            fixed += ch;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            fixed += ch;
            continue;
        }
        if (inString) {
            if (ch === '\n') { fixed += '\\n'; continue; }
            if (ch === '\r') { fixed += '\\r'; continue; }
            if (ch === '\t') { fixed += '\\t'; continue; }
            // Remove other control chars inside strings
            if (ch.charCodeAt(0) < 32) { fixed += ' '; continue; }
        }
        fixed += ch;
    }

    // Fix trailing commas
    fixed = fixed.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    try { return JSON.parse(fixed); } catch (e) {
        logger?.error(`❌ [Parser] All parse attempts failed. Error: ${e.message}`);
        throw new Error(`Failed to parse AI response as JSON. Parse error: ${e.message}`);
    }
};

const validateAIResponse = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return false;
    if (!parsed.executiveSummary) return false;
    if (!Array.isArray(parsed.findings)) return false;
    return true;
};

const generateFallbackReport = (targetUrl, cleanedData, errorMessage) => {
    const findings = cleanedData?.findings || [];
    return {
        executiveSummary: {
            overview: `An automated security assessment was performed against ${targetUrl}. The AI analysis engine encountered an error.`,
            securityPostureNarrative: `Processing error: ${errorMessage}.`,
            technologyAnalysis: `Unavailable.`,
            keyObservations: ['AI analysis failed — manual review recommended'],
            immediateActions: findings.slice(0, 3).map(f => ({
                action: `Review ${f.title}`,
                rationale: `Automated scanner flagged as ${f.severity}`,
                timeline: 'ASAP',
                assignTo: 'Security Team',
                finding_ref: f.id
            }))
        },
        findings: findings.map(f => ({
            id: f.id,
            title: f.title,
            severity: f.severity,
            riskRating: `Scanner classification: ${f.severity}`,
            technicalDescription: `Potential ${f.title} detected. Manual validation required.`,
            remediation: {
                recommendation: 'Validate manually',
                technicalFix: 'N/A',
                quickWin: 'Verify and patch'
            }
        })),
        _meta: { aiStatus: 'FALLBACK', errorMessage }
    };
};

/**
 * Main function: Generate structured report content via OpenRouter / OpenAI-compatible API
 */
exports.generateReportContent = async (targetUrl, cleanedData) => {
    const safeTargetUrl = typeof targetUrl === 'string' ? targetUrl.replace(/[\r\n<>"]/g, '') : '';

    if (!cleanedData || typeof cleanedData !== 'object') {
        throw new Error('No valid scan data provided to AI');
    }

    const prompt = REPORT_PROMPT
        .replace('{{DATA}}', JSON.stringify(cleanedData.findings || [], null, 2))
        .replace('{{TARGET_URL}}', safeTargetUrl)
        .replace('{{DATE}}', new Date().toISOString().split('T')[0]);

    // Universal AI Configuration
    const apiUrl = process.env.AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const apiKey = process.env.AI_API_KEY;
    const aiModel = (process.env.AI_MODEL || 'arcee-ai/trinity-large-preview:free').trim();

    logger?.info(`🔧 [AI Config] URL: ${apiUrl} | Model: ${aiModel} | Key: ${apiKey ? apiKey.substring(0,10) + '...' : 'NOT SET'}`);

    if (!apiKey) {
        logger?.error('❌ AI API Key is not set in .env (AI_API_KEY)');
        return generateFallbackReport(targetUrl, cleanedData, 'AI API Key is not configured');
    }

    let lastError = null;
    const aiStartTime = Date.now();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            logger?.info(`🤖 [AI] Attempt ${attempt}/${MAX_ATTEMPTS} — Model: ${aiModel}`);

            const response = await axios.post(
                apiUrl,
                {
                    model: aiModel,
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'system',
                            content: `You are a Principal Penetration Tester (OSCP, OSCE, GXPN) with 20+ years of offensive security experience at Big 4 consultancies.

CRITICAL RULES:
- Output ONLY valid JSON. Start with { end with }. Zero text outside JSON.
- Use ONLY provided scan data. NEVER fabricate findings, endpoints, or evidence.
- Preserve exact riskScore, severity, and priority values from input data.
- technicalDescription: 8-12 sentences with CWE IDs, protocol analysis, root cause.
- attackScenario: 8-12 sentences narrative with specific tools (Burp, SQLMap, Nuclei) and MITRE ATT&CK IDs.
- businessImpact: 6-8 sentences with GDPR/PCI-DSS/SOC2 references and breach cost estimates.
- remediation.technicalFix: 30-60 lines BEFORE/AFTER code matching target technology.
- defenseInDepth: 4 layers (Application, WAF, Network, Monitoring) per finding.
- QUALITY OVER BREVITY. Every field must be substantial and detailed.`
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.2,
                    max_tokens: 32000,
                    top_p: 0.85,
                    stream: false,
                    provider: {
                        allow_fallbacks: true,
                        require_parameters: true
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': 'https://vulncraft.io',
                        'X-Title': 'VulnCraft Security Platform'
                    },
                    timeout: 120000,  // 2 دقيقة بدل 5
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            if (!response.data?.choices?.[0]) {
                throw new Error('Empty or invalid API response');
            }

            let rawText = response.data.choices[0].message?.content;
            if (!rawText) {
                throw new Error('No content in API response');
            }

            const finishReason = response.data.choices[0].finish_reason;
            logger?.info(`📦 Raw response length: ${rawText.length} chars | Finish: ${finishReason}`);
            logger?.info(`🔍 [DEBUG] First 300 chars: ${rawText.substring(0, 300)}`);
            logger?.info(`🔍 [DEBUG] Last 200 chars: ${rawText.substring(rawText.length - 200)}`);

            if (finishReason === 'length') {
                logger?.warn('⚠️ Response was TRUNCATED by token limit! Trying to repair...');
                // Try to close the JSON by finding the last complete object
                let repairedText = rawText.trim();
                // Remove trailing incomplete values
                repairedText = repairedText.replace(/,\s*"[^"]*":\s*"?[^}]*$/, '');
                // Close any open arrays and objects
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

            const usage = response.data.usage;
            if (usage) {
                logger?.info(`📊 Tokens — Prompt: ${usage.prompt_tokens} | Completion: ${usage.completion_tokens}`);
            }

            const totalDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);
            logger?.info(`✅ [AI] Report generated — ${totalDuration}s`);
            parsed._meta = { aiStatus: 'SUCCESS', provider: 'OpenRouter', model: aiModel, duration: `${totalDuration}s` };
            return parsed;

        } catch (err) {
            lastError = err;
            const statusCode = err.response?.status;
            const isRateLimit = statusCode === 429;
            const errorDetail = err.response?.data?.error?.message || err.message;
            const waitTime = isRateLimit ? (attempt * 10000) : 3000;

            logger?.warn(`⚠️ [AI] Attempt ${attempt} failed (${statusCode || 'N/A'}): ${errorDetail}`);
            console.error(`⚠️ [AI] Attempt ${attempt} FAILED:`, errorDetail);

            if (attempt < MAX_ATTEMPTS) {
                logger?.info(`🔄 Waiting ${waitTime/1000}s before retry...`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }

    const totalDuration = ((Date.now() - aiStartTime) / 1000).toFixed(1);
    logger?.error(`❌ [AI] All attempts failed after ${totalDuration}s. Error: ${lastError?.message}`);
    return generateFallbackReport(safeTargetUrl, cleanedData, lastError?.message || 'Unknown error');
};
