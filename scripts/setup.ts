
import prompts from 'prompts';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

async function main() {
    console.log('\n🧠 Welcome to OpenClaw Memory System Setup! 🧠\n');

    const response = await prompts([
        {
            type: 'select',
            name: 'provider',
            message: 'Which AI Provider would you like to use?',
            choices: [
                { title: 'OpenAI (Standard)', value: 'openai' },
                { title: 'Minimax (Cost Effective)', value: 'minimax' },
                { title: 'Kimi + Minimax (Best Performance/Price)', value: 'dual' },
                { title: 'Ollama (Local/Free)', value: 'ollama' },
            ],
        },
    ]);

    let envContent = '';

    if (response.provider === 'openai') {
        const apiKey = await prompts({
            type: 'password',
            name: 'key',
            message: 'Enter your OpenAI API Key (sk-...):',
            validate: value => value.length > 10 ? true : 'Invalid Key format'
        });
        envContent = `OPENAI_API_KEY=${apiKey.key}\nOPENAI_BASE_URL=https://api.openai.com/v1\nEMBEDDING_MODEL=text-embedding-3-small\n`;
    }
    else if (response.provider === 'minimax') {
        const config = await prompts({
            type: 'password',
            name: 'key',
            message: 'Enter Minimax API Key:',
            validate: value => value.length > 5 ? true : 'Invalid Key'
        });
        const group = await prompts({
            type: 'text',
            name: 'id',
            message: 'Enter Group ID (Optional):'
        });
        envContent = `OPENAI_API_KEY=${config.key}\nOPENAI_BASE_URL=https://api.minimax.chat/v1\nEMBEDDING_MODEL=embo-01\n`;
        if (group.id) envContent += `MINIMAX_GROUP_ID=${group.id}\n`;
    }
    else if (response.provider === 'dual') {
        const config = await prompts([
            {
                type: 'password',
                name: 'kimiKey',
                message: 'Enter Kimi (Moonshot) API Key:',
            },
            {
                type: 'password',
                name: 'minimaxKey',
                message: 'Enter Minimax API Key:',
            }
        ]);
        // We need to support this structure in .env or config loading
        // For now, simpler to output JSON config or instructions
        // But let's stick to .env standard format for this script
        envContent = `OPENAI_API_KEY=unused\n\n# Kimi (LLM)\nLLM_API_KEY=${config.kimiKey}\nLLM_BASE_URL=https://api.moonshot.cn/v1\nLLM_MODEL=moonshot-v1-8k\n\n# Minimax (Embedding)\nEMBEDDING_API_KEY=${config.minimaxKey}\nEMBEDDING_BASE_URL=https://api.minimax.chat/v1\nEMBEDDING_MODEL=embo-01\n`;
    }
    else if (response.provider === 'ollama') {
        envContent = `OPENAI_API_KEY=ollama\nOPENAI_BASE_URL=http://localhost:11434/v1\nEMBEDDING_MODEL=nomic-embed-text\n`;
        console.log('\n⚠️  Ensure you have Ollama running with: ollama serve');
    }

    if (envContent) {
        fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);
        console.log('\n✅ Configuration saved to .env');
        console.log('🚀 You are ready! Run "npm run demo" to start.');
    } else {
        console.log('Setup cancelled.');
    }
}

main().catch(console.error);
