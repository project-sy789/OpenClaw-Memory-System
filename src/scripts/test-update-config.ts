
import { OpenClawMemory } from '../index';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function main() {
    console.log('🔄 Testing Dynamic Config Update...\n');

    // 1. Start with invalid config
    console.log('1. Initializing with DUMMY key...');
    const memory = new OpenClawMemory({
        openaiApiKey: 'sk-dummy-key-12345',
        logLevel: 'error' // suppress errors for now
    });

    // 2. Check health (Expect Failure)
    console.log('   Checking health (should fail)...');
    const health1 = await memory.health();
    if (health1.status === 'ok') {
        console.error('❌ Failed: Expected error but got OK');
    } else {
        console.log('✅ Correctly failed with invalid key.');
    }

    // 3. Update to Valid Config
    console.log('\n2. Hot-Swapping to VALID key from .env...');

    // Get real key from env or use a fallback if not present for test
    const realKey = process.env.OPENAI_API_KEY;
    if (!realKey || realKey === 'unused') {
        const kimiKey = process.env.LLM_API_KEY;
        const miniKey = process.env.EMBEDDING_API_KEY;

        if (kimiKey && miniKey) {
            await memory.updateConfig({
                llmProvider: { apiKey: kimiKey, baseUrl: process.env.LLM_BASE_URL, model: process.env.LLM_MODEL },
                embeddingProvider: { apiKey: miniKey, baseUrl: process.env.EMBEDDING_BASE_URL, model: process.env.EMBEDDING_MODEL }
            });
        } else {
            console.log('⚠️ No valid keys found in .env to test with. Skipping actual update.');
            return;
        }
    } else {
        await memory.updateConfig({
            openaiApiKey: realKey
        });
    }

    // 4. Check health again (Expect Success)
    console.log('   Checking health again (should succeed)...');
    const health2 = await memory.health();
    if (health2.status === 'ok') {
        console.log('✅ Success! Host-swap worked. System is healthy.');
        console.log(`   Latency: Embed=${health2.components.embeddingProvider.latency}ms, LLM=${health2.components.llmProvider.latency}ms`);
    } else {
        console.error('❌ Failed: Still unhealthy after update.', health2);
    }

    memory.close();
}

main().catch(console.error);
