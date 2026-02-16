
import { OpenClawMemory } from './index';
import { OpenAIProvider } from './providers/openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (OPENAI_API_KEY)
dotenv.config();

async function runDemo() {
    console.log('--- 🧠 OpenClaw Memory System Demo (Delegated AI) ---');

    // Detect available brain (Minimax or OpenAI)
    const isMinimax = !!process.env.MINIMAX_API_KEY;
    const apiKey = process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.MINIMAX_BASE_URL || (isMinimax ? 'https://api.minimax.chat/v1' : undefined) || process.env.OPENAI_BASE_URL;

    if (!apiKey) {
        console.error('ERROR: No AI Brain found! (Please set MINIMAX_API_KEY or OPENAI_API_KEY)');
        return;
    }

    console.log(`🔌 Connecting OpenClaw to Brain: ${isMinimax ? 'Minimax' : 'OpenAI'}`);

    // Select models based on provider
    const chatModel = isMinimax ? (process.env.LLM_MODEL || 'abab6.5s-chat') : 'gpt-4o-mini';
    const embedModel = isMinimax ? (process.env.EMBEDDING_MODEL || 'embo-01') : 'text-embedding-3-small';

    // 1. Initialize the AI Provider (The Host handles the API Key)
    const provider = new OpenAIProvider(apiKey, baseUrl, chatModel, embedModel);

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
