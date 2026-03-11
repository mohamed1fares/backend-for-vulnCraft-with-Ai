// scripts/setup.js
const { exec } = require('child_process');
const fs = require('fs');

console.log("🚀 Starting Project Setup...");

const runCommand = (command, message) => {
    return new Promise((resolve, reject) => {
        console.log(`\n👉 ${message}...`);
        const process = exec(command);
        process.stdout.on('data', (data) => console.log(data.toString()));
        process.stderr.on('data', (data) => console.error(data.toString()));
        process.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(`❌ Error in ${message}`);
        });
    });
};

const setup = async () => {
    try {
        await runCommand('npm install', 'Installing Dependencies');
        
        if (!fs.existsSync('./reports')) {
            fs.mkdirSync('./reports');
            console.log("✅ Reports directory created.");
        }

        console.log("\n⏳ Checking Llama 3.1 Model...");
        await runCommand('ollama pull llama3.1', 'Pulling AI Model');

        console.log("\n🎉 Setup Finished! Run 'npm start' to begin.");
    } catch (error) {
        console.error("\n💥 Setup Failed:", error);
    }
};

setup();