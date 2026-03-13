const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const testGeminiModels = async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log(`🔑 Testing with API Key: ${apiKey?.substring(0, 5)}...`);
    
    if (!apiKey) {
        console.error('❌ GEMINI_API_KEY not found in .env');
        return;
    }

    const versions = ['v1', 'v1beta'];
    
    for (const v of versions) {
        try {
            console.log(`\n⏳ Checking models in ${v}...`);
            const url = `https://generativelanguage.googleapis.com/${v}/models?key=${apiKey}`;
            const response = await axios.get(url);
            
            if (response.data?.models) {
                console.log(`✅ Success in ${v}! Found ${response.data.models.length} models.`);
                const flashModels = response.data.models.filter(m => m.name.includes('flash'));
                console.log('Flash models found:');
                flashModels.forEach(m => console.log(`   - ${m.name}`));
            }
        } catch (err) {
            console.error(`❌ Failed in ${v}: ${err.message}`);
            if (err.response?.data) {
                console.error('   Error detail:', JSON.stringify(err.response.data.error, null, 2));
            }
        }
    }
};

testGeminiModels();
