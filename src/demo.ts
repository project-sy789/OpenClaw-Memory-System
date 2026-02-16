
import { OpenClawMemory } from './index';
import { OpenAIProvider } from './providers/openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (OPENAI_API_KEY)
dotenv.config();

async function runDemo() {
    console.log('--- 🧠 OpenClaw Memory System Demo (Delegated AI) ---');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('ERROR: OPENAI_API_KEY not found in .env');
        console.log('Please set OPENAI_API_KEY in your .env file.');
        return;
    }

    // 1. Initialize the AI Provider (The Host handles the API Key)
    // The memory system no longer needs to know about API keys internally.
    const provider = new OpenAIProvider(apiKey, process.env.OPENAI_BASE_URL);

    // 2. Initialize the Memory System with the provider
    const memory = new OpenClawMemory({
        aiProvider: provider,
        memoryDir: './memory-demo',
        logLevel: 'info'
    });

    try {
        console.log('\n1️⃣ Storing new knowledge...');
        await memory.rememberFact('OpenClaw uses a Delegated AI architecture for better security.', ['architecture', 'security']);
        await memory.rememberFact('The host application manages API keys and passes a provider interface.', ['security']);

        console.log('\n2️⃣ Searching memory...');
        const query = 'How does OpenClaw handle security and API keys?';
        const { context, tokensUsed } = await memory.recall(query);

        console.log('\n🔍 Retrieval Results:');
        console.log('----------------------------------------');
        console.log(context);
        console.log('----------------------------------------');
        console.log(`Tokens used: ${tokensUsed}`);

        console.log('\n3️⃣ System Health Check:');
        const health = await memory.health();
        console.log(JSON.stringify(health, null, 2));

    } catch (error) {
        console.error('Demo Error:', error);
    } finally {
        memory.close();
    }
}

runDemo();
