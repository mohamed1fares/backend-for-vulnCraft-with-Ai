const axios = require('axios');

exports.generateReportContent = async (targetUrl, cleanedData) => {
    const prompt = `
    You are a Senior Security Analyst. Write a "Penetration Testing Report" for the target: ${targetUrl}.
    
    Data Provided:
    ${JSON.stringify(cleanedData)}

    **Strict Requirements:**
    1. Output MUST be in valid **Markdown**.
    2. Structure:
       # Executive Summary
       (Brief business risk overview).
       # Findings Summary
       (A quick list/table of found issues).
       # Detailed Technical Findings
       (For each issue: Name, Severity, Description, Impact, and Remediation).
    3. Do NOT write conversational filler (like "Here is the report"). Start directly with the # Title.
    `;

    try {
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: "llama3.1",
            prompt: prompt,
            stream: false,
            options: { num_ctx: 8192 } // ذاكرة كافية للتقرير
        });
        return response.data.response;
    } catch (error) {
        console.error("AI Service Error:", error.message);
        throw new Error("Ollama is not running or Model not found.");
    }
};