
import { OpenClawMemory } from '../index';
import { OpenAIProvider } from '../providers/openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    console.log('🏥 OpenClaw Health Check (Delegated AI)...');

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('❌ ERROR: OPENAI_API_KEY not found in .env');
        process.exit(1);
    }

    // 1. Host provides the AI capabilities
    const provider = new OpenAIProvider(apiKey, process.env.OPENAI_BASE_URL);

    // 2. Initialize Memory System with the provider
    const memory = new OpenClawMemory({
        aiProvider: provider,
        logLevel: 'info'
    });

    try {
        const report = await memory.health();

        console.log('\n📊 System Status:', report.status === 'ok' ? '✅ OK' : report.status === 'degraded' ? '⚠️ Degraded' : '❌ Error');
        console.log(`🕒 Timestamp: ${report.timestamp}`);
        console.log('----------------------------------------');

        console.log('💾 Database:         ', report.components.database.status === 'ok' ? '✅ OK' : `❌ Error`);

        const providerStatus = report.components.embeddingProvider;
        console.log('🧠 AI Provider:      ', providerStatus.status === 'ok' ? `✅ OK (${providerStatus.latency}ms)` : `❌ Error: ${providerStatus.message}`);

        console.log('----------------------------------------');

        memory.close();
    } catch (error) {
        console.error('❌ Critical Error during health check:', error);
        process.exit(1);
    }
}

main();
