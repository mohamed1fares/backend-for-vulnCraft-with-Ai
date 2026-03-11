const axios = require('axios');
const logger = require('../../../utils/logger.utils');

exports.generateReportContent = async (targetUrl, cleanedData) => {
    
    // 1. هندسة الأوامر (نسخة المقال الاحترافي)
    const prompt = `
ROLE: 
You are a Senior Cybersecurity Consultant (OSCP certified) writing a strategic security assessment article for a client.

TASK:
Analyze the vulnerability scan results for "${targetUrl}" and write a professional, easy-to-read "Security Assessment Article".
The tone should be sophisticated yet accessible (Fortune 500 Consulting Style).

INPUT DATA:
${JSON.stringify(cleanedData, null, 2)}

ARTICLE STRUCTURE & GUIDELINES:

# 1. Executive Insight (The "Hook")
- Don't just list numbers. Write a narrative paragraph describing the overall security health of the application.
- Answer the CEO's question: "Is my business safe?"
- Highlight the most critical risk in plain English (Business Impact).

# 2. Scope of Analysis
- **Target:** ${targetUrl}
- **Engine:** VulnCraft AI (Hybrid Analysis).
- **Focus:** Web Application Security & API Integrity.

# 3. Critical Findings (The "Core")
(Select the top 3-5 most dangerous vulnerabilities only. Don't list minor info issues here).
For each critical finding:
## [Vulnerability Name]
- **The Risk:** Why is this dangerous? (Explain like you are talking to a manager).
- **Technical Detail:** (Briefly explain the flaw for developers).
- **The Fix:** Provide a clean, copy-paste code snippet.
  \`\`\`[language]
  // Secure Code Example
  \`\`\`

# 4. Full Vulnerability Table
(Create a clean Markdown table summarizing ALL findings, including low severity ones).
| ID | Vulnerability | Severity | Status |
|----|---------------|----------|--------|
| 1  | SQL Injection | 🔴 Critical | Open   |
| ...| ...           | ...      | ...    |

# 5. Strategic Recommendations (The "Value Add")
- Give 3 high-level recommendations to improve the security culture (e.g., "Shift Left", "WAF Implementation").

CONSTRAINTS:
- Format: Clean Markdown.
- Tone: Professional, Constructive, Authoritative.
- No JSON in output.
- Avoid overly complex jargon in the Executive Insight section.
    `;

    try {
        if (logger) logger.info(`🤖 Generating Professional Article using Hybrid Mode for: ${targetUrl}`);

        // حساب تقريبي لحجم الداتا عشان لو كبيرة ينبهك في اللوج
        const dataStr = JSON.stringify(cleanedData);
        if (dataStr.length > 10000) if (logger) logger.warn("⚠️ Heavy Input Data: Processing might take extra time.");

        const response = await axios.post('http://localhost:11434/api/generate', {
            model: "llama3.1", 
            prompt: prompt,
            stream: false,
            
            // 🔥 إعدادات المعالجة الهجينة (Hybrid CPU/GPU)
            options: { 
                // 1. الذاكرة (Context)
                // 8192 كافية جداً لمقال شامل وتفصيلي
                num_ctx: 8192,
                
                // 2. توزيع الحمل (The Magic Number)
                // RTX 3050 (4GB) -> Best setting is 18-20 layers.
                // الباقي هيروح للبروسيسور والرامات العادية.
                num_gpu: 20, 
                
                // 3. إعدادات جودة الكتابة
                temperature: 0.3,      // متوازن بين الدقة والإبداع المهني
                top_p: 0.9, 
                repeat_penalty: 1.1,   // عشان ميكررش الكلام
                
                // 4. تحسين الأداء
                num_thread: 8,         // استغل انوية البروسيسور (ممكن تخليها 6 أو 8 حسب جهازك)
                num_predict: -1        // سيبه يكتب لحد ما يخلص فكرته
            } 
        }, {
            // وقت كافي جداً للمعالجة الهجينة (20 دقيقة)
            timeout: 1200000, 
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (response.data && response.data.response) {
            if (logger) logger.info(`✅ Article Generated Successfully (Hybrid Mode)`);
            
            // ترويسة التقرير (Header)
            const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' });
            
            const reportWithMetadata = `---
Report Generated: ${timestamp}
Target: ${targetUrl}
Analysis Engine: VulnCraft AI (Hybrid Architecture)
Confidentiality: Internal / Restricted
---

${response.data.response}

---
<div align="center">
    <strong>VulnCraft Project</strong> • <em>Next-Gen Security Analysis</em>
</div>
`;
            return reportWithMetadata;
        } else {
            throw new Error("Received empty response from AI Model");
        }

    } catch (error) {
        // نفس نظام معالجة الأخطاء العبقري اللي في كودك (سيبته زي ما هو)
        const errMsg = error.message;
        
        if (errMsg.includes("404")) console.error("❌ Model not found! Run: ollama pull llama3.1");
        else if (errMsg.includes("timeout")) console.error("⏱️ Timeout! Try reducing num_ctx to 4096.");
        else if (errMsg.includes("out of memory")) console.error("💾 GPU OOM! Try reducing num_gpu to 15.");
        
        if (logger && logger.error) logger.error(`AI Service Error: ${errMsg}`);
        else console.error("Full Error:", errMsg);
        
        // إرجاع رسالة خطأ منسقة في ملف الـ PDF
        return `# Report Generation Failed
**Target:** ${targetUrl}
**Error:** AI Processing Error (Hybrid Mode)
**Details:** ${errMsg}
**Tip:** If OOM occurs, try lowering 'num_gpu' in code.`;
    }
};