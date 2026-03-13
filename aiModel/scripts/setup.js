// scripts/setup.js — Project Setup for OpenRouter AI API
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

console.log('🚀 Starting Project Setup...\n');

/* ===============================
   🔧 Helpers
   =============================== */

const ensureDir = (dirPath, label) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ ${label} directory created.`);
    } else {
        console.log(`✔️ ${label} directory already exists.`);
    }
};

/* ===============================
   🚀 Setup Process
   =============================== */

const setup = async () => {
    try {
        /* ===============================
           1️⃣ Check Node Dependencies
           =============================== */
        if (!fs.existsSync(path.join(__dirname, '../../../node_modules'))) {
            console.log('⚠️ node_modules not found. Run: npm install');
        } else {
            console.log('✔️ node_modules installed.');
        }

        /* ===============================
           2️⃣ Ensure Required Directories
           =============================== */
        ensureDir(path.join(__dirname, '../ai_PDF'), 'ai_PDF');
        ensureDir(path.join(__dirname, '../reports'), 'reports');

        /* ===============================
           3️⃣ Check AI API Configuration
           =============================== */
        console.log('\n⏳ Checking AI API configuration...');
        // const apiKey = process.env.GROQ_API_KEY;
        // if (!apiKey) {
        //     throw new Error(
        //         'GROQ_API_KEY is not set in .env file.\n' +
        //         '👉 Get your free API key from: https://openrouter.ai/keys'
        //     );
        // }
        // console.log('✔️ API Key is configured.');

        // const model = process.env.GROQ_MODEL || 'nousresearch/hermes-3-llama-3.1-405b:free';
        // console.log(`📦 Model: ${model}`);
        const aiKey = process.env.AI_API_KEY;
        if (!aiKey) {
            console.log('⚠️ AI_API_KEY is not set in .env.');
        } else {
            console.log('✔️ AI API Key is configured.');
        }

        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) {
            console.log('⚠️ GROQ_API_KEY is not set in .env.');
        } else {
            console.log('✔️ Groq API Key is configured.');
        }

        if (!aiKey && !groqKey) {
            throw new Error('No AI API Keys configured in .env');
        }

        /* ===============================
           4️⃣ Test AI API Connection
           =============================== */
        //    console.log('\n🧠 Testing AI API connection (OpenRouter)...');
        //    try {
        //        const response = await axios.post(
        //            process.env.GROQ_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
        //            {
        //                model,
        //                messages: [{ role: 'user', content: 'Reply with OK' }],
        //                max_tokens: 5
        //            },
        //            {
        //                headers: {
        //                    'Content-Type': 'application/json',
        //                    'Authorization': `Bearer ${apiKey}`,
        //                    'HTTP-Referer': 'https://vulncraft.io',
        //                    'X-Title': 'VulnCraft Security Platform'
        //                },
        //                timeout: 30000
        //            }
        //        );
        if (aiKey) {
            console.log('\n🧠 Testing AI API connection (OpenRouter)...');
            const model = (process.env.AI_MODEL || 'arcee-ai/trinity-large-preview:free').trim();
            const apiUrl = process.env.AI_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

            try {
                const response = await axios.post(apiUrl, {
                    model,
                    messages: [{ role: 'user', content: 'Reply with OK' }],
                    max_tokens: 5
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${aiKey}`,
                        'HTTP-Referer': 'https://vulncraft.io',
                        'X-Title': 'VulnCraft Security Platform'
                    },
                    timeout: 30000
                });
                if (response.data?.choices?.[0]) {
                    console.log(`✅ AI API connection successful! Model: ${response.data.model || model}`);
                }
            } catch (err) {
                console.log(`❌ AI API test failed: ${err.response?.data?.error?.message || err.message}`);
            }
        }

        /* ===============================
           5️⃣ Check Logo Files
           =============================== */
        const logoDir = path.join(__dirname, '../reports');
        const logos = ['logo-fcis.png', 'logo-october.png'];
        for (const logo of logos) {
            const exists = fs.existsSync(path.join(logoDir, logo));
            console.log(`${exists ? '✔️' : '⚠️'} ${logo}: ${exists ? 'Found' : 'Missing (cover page will skip logo)'}`);
        }

        console.log('\n🎉 Setup Completed Successfully!');
        console.log('👉 Run: npm start');

    } catch (error) {
        console.error('\n💥 Setup Failed:\n', error.message || error);
        process.exit(1);
    }
};

setup();
