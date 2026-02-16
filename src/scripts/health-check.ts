
import { OpenClawMemory } from '../index';
import { resolveConfig } from '../config';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    console.log('🏥 OpenClaw Health Check...');

    const config = {
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        openaiBaseUrl: process.env.OPENAI_BASE_URL,
        // If these are set in env they will be picked up by resolveConfig usually
        // but let's pass them if available
        llmProvider: process.env.LLM_API_KEY ? {
            apiKey: process.env.LLM_API_KEY,
            baseUrl: process.env.LLM_BASE_URL,
            model: process.env.LLM_MODEL
        } : undefined,
        embeddingProvider: process.env.EMBEDDING_API_KEY ? {
            apiKey: process.env.EMBEDDING_API_KEY,
            baseUrl: process.env.EMBEDDING_BASE_URL,
            model: process.env.EMBEDDING_MODEL
        } : undefined
    };

    const memory = new OpenClawMemory(config);

    try {
        const report = await memory.health();

        console.log('\n📊 System Status:', report.status === 'ok' ? '✅ OK' : report.status === 'degraded' ? '⚠️ Degraded' : '❌ Error');
        console.log(`🕒 Timestamp: ${report.timestamp}`);
        console.log('----------------------------------------');

        console.log('💾 Database:         ', report.components.database.status === 'ok' ? '✅ OK' : `❌ Error: ${report.components.database.details}`);

        const embed = report.components.embeddingProvider;
        console.log('🧠 Embedding API:    ', embed.status === 'ok' ? `✅ OK (${embed.latency}ms)` : `❌ Error: ${embed.message}`);

        const llm = report.components.llmProvider;
        console.log('🤖 LLM API:          ', llm.status === 'ok' ? `✅ OK (${llm.latency}ms)` : `❌ Error: ${llm.message}`);

        console.log('----------------------------------------');

        // Cleanup
        memory.close();

        if (report.status === 'error') process.exit(1);
    } catch (error) {
        console.error('❌ Critical Error during health check:', error);
        process.exit(1);
    }
}

main();
