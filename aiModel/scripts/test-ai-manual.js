const { generateReportContent } = require('../src/utils/ollama.service');
const { prepareDataForAI } = require('../src/utils/ai-cleaner.utils');

// داتا وهمية كأنها جاية من البايثون
const dummyScanData = [
    {
        vulnerabilityName: "SQL Injection",
        severity: "High",
        technicalDetail: {
            summary: {
                findings_count: 5,
                findings: [
                    { url: "http://test.com/login", method: "POST", param: "username" }
                ]
            }
        }
    }
];

const runTest = async () => {
    console.log("🧪 1. Testing Data Cleaner...");
    try {
        const cleaned = prepareDataForAI(dummyScanData);
        console.log("✅ Cleaner Output:", JSON.stringify(cleaned, null, 2));

        console.log("\n🧪 2. Testing AI Connection (Ollama)...");
        console.log("⏳ Waiting for Llama 3.1...");
        
        const report = await generateReportContent("http://test.com", cleaned);
        
        console.log("\n✅ AI Response Received!");
        console.log("---------------------------------------------------");
        console.log(report.substring(0, 100) + "..."); // نعرض أول 100 حرف بس
        console.log("---------------------------------------------------");
        console.log("🎉 SYSTEM IS HEALTHY!");

    } catch (error) {
        console.error("❌ TEST FAILED:", error.message);
        console.log("💡 نصيحة: اتأكد إن Ollama شغال بالأمر: ollama serve");
    }
};

runTest();